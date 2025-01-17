import $ from 'cafy';
import { ID } from '../../../../misc/cafy-id';
import define from '../../define';
import { ApiError } from '../../error';
import { Channels, DriveFiles } from '../../../../models';

export const meta = {
	tags: ['channels'],

	requireCredential: true as const,

	kind: 'write:channels',

	params: {
		channelId: {
			validator: $.type(ID),
		}
	},

	res: {
		type: 'object' as const,
		optional: false as const, nullable: false as const,
		ref: 'Channel',
	},

	errors: {
		noSuchChannel: {
			message: 'No such channel.',
			code: 'NO_SUCH_CHANNEL',
			id: 'f9c5467f-d492-4c3c-9a8d-a70dacc86512'
		},

		accessDenied: {
			message: 'You do not have edit privilege of the channel.',
			code: 'ACCESS_DENIED',
			id: '1fb7cb09-d46a-4fdf-b8df-057788cce513'
		},

		noSuchFile: {
			message: 'No such file.',
			code: 'NO_SUCH_FILE',
			id: 'e86c14a4-0da2-4032-8df3-e737a04c7f3b'
		},
	}
};

export default define(meta, async (ps, me) => {
	const channel = await Channels.findOne({
		id: ps.channelId,
	});

	if (channel == null) {
		throw new ApiError(meta.errors.noSuchChannel);
	}

	//削除はモデレータでもできる
	if (channel.userId !== me.id && !(me.isAdmin || me.isModerator)) {
		throw new ApiError(meta.errors.accessDenied);
	}

	await Channels.delete(channel.id);

});
