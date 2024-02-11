import * as os from 'os';
import * as cluster from 'cluster';
import * as chalk from 'chalk';
import { getConnection } from 'typeorm';

import Logger from '../services/logger';
import loadConfig from '../config/load';
import { Config } from '../config/types';
import { program } from '../argv';
import { showMachineInfo } from '../misc/show-machine-info';
import { initDb } from '../db/postgre';
import * as meta from '../meta.json';

const logger = new Logger('core', 'cyan');
const bootLogger = logger.createSubLogger('boot', 'magenta', false);

function greet() {
	if (!program.quiet) {
		//#region Groundpolis logo
		const v = `v${meta.version}`;
		// tslint:disable:quotemark
		console.log("   ___                      _           _ _    ");
		console.log("  / __|_ _ ___ _  _ _ _  __| |_ __  ___| (_)___");
		console.log(" | (_ | '_/ _ \\ || | ' \\/ _` | '_ \\/ _ \\ | (_-<");
		console.log("  \\___|_| \\___/\\_,_|_||_\\__,_| .__/\\___/_|_/__/");
		console.log("                             |_|               ");

		console.log(chalk.gray(v));
		//#endregion

		console.log(' Groundpolis is an open-source decentralized microblogging platform forked from Misskey.');
		console.log(chalk.keyword('orange')(' If you like Misskey, please donate to support development. https://www.patreon.com/syuilo'));

		console.log('');
		console.log(chalk`--- ${os.hostname()} {gray (PID: ${process.pid.toString()})} ---`);
	}

	bootLogger.info('Welcome to Groundpolis!');
	bootLogger.info(`Groundpolis v${meta.version}`, null, true);
}

/**
 * Init master process
 */
export async function masterMain() {
	let config!: Config;

	try {
		greet();

		// initialize app
		config = await init();
	} catch (e) {
		bootLogger.error('Fatal error occurred during initialization', null, true);
		process.exit(1);
	}

	bootLogger.succ('Groundpolis initialized');

	if (!program.disableClustering) {
		await spawnWorkers(config.clusterLimit);
	}

	if (!program.onlyQueue) {
		bootLogger.succ(`Now listening on port ${config.port} on ${config.url}`, null, true);
	}

	if (!program.noDaemons && !program.onlyQueue) {
		require('../daemons/server-stats').default();
		require('../daemons/queue-stats').default();
		require('../daemons/janitor').default();
	}
}

const runningNodejsVersion = process.version.slice(1).split('.').map(x => parseInt(x, 10));

function showEnvironment(): void {
	const env = process.env.NODE_ENV;
	const logger = bootLogger.createSubLogger('env');
	logger.info(typeof env === 'undefined' ? 'NODE_ENV is not set' : `NODE_ENV: ${env}`);

	if (env !== 'production') {
		logger.warn('The environment is not in production mode.');
		logger.warn('DO NOT USE FOR PRODUCTION PURPOSE!', null, true);
	}
	if (program.onlyQueue) logger.warn('onlyQueue is set');
	if (program.onlyServer) logger.warn('onlyServer is set');
	if (program.disableClustering) logger.warn('disableClustering is set');
	if (program.noDaemons) logger.warn('noDaemons is set');
}

/**
 * Init app
 */
async function init(): Promise<Config> {
	showEnvironment();

	await showMachineInfo(bootLogger);

	const nodejsLogger = bootLogger.createSubLogger('nodejs');

	nodejsLogger.info(`Version ${runningNodejsVersion.join('.')}`);

	const configLogger = bootLogger.createSubLogger('config');
	let config;

	try {
		config = loadConfig();
	} catch (exception) {
		if (typeof exception === 'string') {
			configLogger.error(exception);
			process.exit(1);
		}
		if (exception.code === 'ENOENT') {
			configLogger.error('Configuration file not found', null, true);
			process.exit(1);
		}
		throw exception;
	}

	configLogger.succ('Loaded');

	const dbLogger = bootLogger.createSubLogger('db');

	// Try to connect to DB
	try {
		dbLogger.info('Connecting...');
		await initDb();
		const v = await getConnection().query('SHOW server_version').then(x => x[0].server_version);
		dbLogger.succ(`Connected: v${v}`);
	} catch (e) {
		dbLogger.error('Cannot connect', null, true);
		dbLogger.error(e);
		process.exit(1);
	}

	return config;
}

async function spawnWorkers(limit = 1) {
	const workers = Math.min(limit, os.cpus().length);
	bootLogger.info(`Starting ${workers} worker${workers === 1 ? '' : 's'}...`);
	await Promise.all([...Array(workers)].map(spawnWorker));
	bootLogger.succ('All workers started');
}

function spawnWorker(): Promise<void> {
	return new Promise(res => {
		const worker = cluster.fork();
		worker.on('message', (message: any) => {
			if (message === 'listenFailed') {
				bootLogger.error(`The server Listen failed due to the previous error.`);
				process.exit(1);
			}
			if (message !== 'ready') return;
			res();
		});
	});
}
