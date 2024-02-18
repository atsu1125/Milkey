import * as Bull from 'bull';
import request from '../../remote/activitypub/request';
import { registerOrFetchInstanceDoc } from '../../services/register-or-fetch-instance-doc';
import Logger from '../../services/logger';
import { Instances } from '../../models';
import { instanceChart } from '../../services/chart';
import { fetchInstanceMetadata } from '../../services/fetch-instance-metadata';
import { fetchMeta } from '../../misc/fetch-meta';
import { toPuny } from '../../misc/convert-host';
import { StatusError } from '../../misc/fetch';

const logger = new Logger('deliver');

let latest: string | null = null;

export default async (job: Bull.Job) => {
	const { host } = new URL(job.data.to);

	// ブロックしてたら中断
	const meta = await fetchMeta();
	if (meta.blockedHosts.includes(toPuny(host))) {
		return 'skip (blocked)';
	}

	// isSuspendedなら中断
	const suspendedHosts = await Instances.find({
		where: {
			isSuspended: true
		},
		cache: 60 * 1000
	});
	if (suspendedHosts.map(x => x.host).includes(toPuny(host))) {
		return 'skip (suspended)';
	}

	try {
		if (latest !== (latest = JSON.stringify(job.data.content, null, 2))) {
			logger.debug(`delivering ${latest}`);
		}

		await request(job.data.user, job.data.to, job.data.content);

		// Update stats
		registerOrFetchInstanceDoc(host).then(i => {
			Instances.update(i.id, {
				latestRequestSentAt: new Date(),
				latestStatus: 200,
				lastCommunicatedAt: new Date(),
				isNotResponding: false
			});

			fetchInstanceMetadata(i);

			// 一定期間配送エラーなら配送を停止する
			const faildays = 1000 * 60 * 60 * 24 * 7; // 7日前まで許容
			if (i.lastCommunicatedAt.getTime() && (i.lastCommunicatedAt.getTime() < (Date.now() - faildays))) {
				Instances.update(i.id, {
					isSuspended: true,
				});
			}

			instanceChart.requestSent(i.host, true);
		});

		return 'Success';
	} catch (res) {
		// Update stats
		registerOrFetchInstanceDoc(host).then(i => {
			Instances.update(i.id, {
				latestRequestSentAt: new Date(),
				latestStatus: res instanceof StatusError ? res.statusCode : null,
				isNotResponding: true
			});

			instanceChart.requestSent(i.host, false);
		});

		if (res instanceof StatusError) {
			// 4xx
			if (res.isClientError) {
				// 401,408,429がどうもpermanent errorじゃなさそう
				if (res.statusCode === 401 || res.statusCode === 408 || res.statusCode === 429) {
					throw `${res.statusCode} ${res.statusMessage}`;
				}
				// HTTPステータスコード4xxはクライアントエラーであり、それはつまり
				// 何回再送しても成功することはないということなのでエラーにはしないでおく
				return `${res.statusCode} ${res.statusMessage}`;
			}

			// ただし501は成功することはない
			if (res.statusCode === 501) {
				return `${res.statusCode} ${res.statusMessage}`;
			}

			// 5xx etc.
			throw `${res.statusCode} ${res.statusMessage}`;
		} else {
			// DNS error, socket error, timeout ...
			throw res;
		}
	}
};
