"use strict";
const events = require('events');
const fs = require('fs');
const path = require('path');
const mkdirp = require('mkdirp');
const logger_1 = require('./logger');
const server_1 = require('./server');
const entities_1 = require('./entities');
const database_1 = require('./database');
const synchronizer_1 = require('./synchronizer');
const addons_1 = require('./addons');
const api_1 = require('./api');
const history_1 = require('./history');
const error_1 = require('./error');
//TODO: convert to ts
let Deploy = require('./runtimes/tools/deploy');
let AddonsTools = require('./runtimes/tools/addons');
(function (AppMode) {
    AppMode[AppMode["DEVELOPMENT"] = 'dev'] = "DEVELOPMENT";
    AppMode[AppMode["PRODUCTION"] = 'prod'] = "PRODUCTION";
})(exports.AppMode || (exports.AppMode = {}));
var AppMode = exports.AppMode;
/**
 * @class App
 * @classdesc
 * The main objects are available from this class.
 * @property {Server} server - Access to the server's options
 * @property {Api} api - Access to the server's endpoints
 * @property {History} history - Access to the history and past actions
 * @property {Database} database - Access to the database methods
 * @property {Addons} addons - Access to the addons methods
 * @property {Entities} entities - Access to the app's entities
 */
class App extends events.EventEmitter {
    constructor(path, options) {
        super();
        this.path = path;
        this.options = options;
        this.materia_path = __dirname;
        this.live = false;
        process.env.TZ = 'UTC';
        if (!this.options) {
            this.options = {};
        }
        if (this.options.prod) {
            this.options.mode = 'prod';
        }
        if (!this.options.mode) {
            this.mode = AppMode.DEVELOPMENT;
        }
        else if (['development', 'dev', 'debug'].indexOf(this.options.mode) != -1) {
            this.mode = AppMode.DEVELOPMENT;
        }
        else if (this.options.mode == 'production' || this.options.mode == 'prod') {
            this.mode = AppMode.PRODUCTION;
            if (!this.options.runtimes) {
                this.options.runtimes = 'core';
            }
        }
        else {
            //console.log('Info: the mode ' + this.options.mode + ' has not been found... Loaded in development mode')
            throw new error_1.default("Unknown mode", {
                debug: 'Option --mode can be development (development/dev/debug) or production (production/prod). e.g. materia start --mode=prod or materia start --mode=dev'
            });
        }
        this.logger = new logger_1.Logger(this);
        this.history = new history_1.History(this);
        this.addons = new addons_1.default(this);
        this.entities = new entities_1.Entities(this);
        this.database = new database_1.Database(this);
        this.api = new api_1.default(this);
        this.server = new server_1.Server(this);
        this.synchronizer = new synchronizer_1.Synchronizer(this);
        this.status = false;
        if (this.options.runtimes != "core") {
            let Git = require('./git');
            this.git = new Git.default(this);
        }
    }
    loadMateria() {
        return this._loadMateriaConfig().then((materiaConf) => {
            if (!materiaConf.name) {
                return Promise.reject(new error_1.default('Missing "name" field in materia.json', {
                    debug: `A minimal materia.json config file should look like:
{
	name: 'NameOfYourApplication'
}`
                }));
            }
            this.infos = materiaConf;
            this.infos.addons = this.infos.addons || {};
            this.name = this.infos.name;
            return Promise.resolve();
        });
    }
    check() {
        if (this.git) {
            return this.git.load().then(() => {
                return this.git.status().then(status => {
                    for (let file of status.files) {
                        if (file.working_dir == 'U') {
                            throw new Error('Git repo contains unresolved conflicts');
                        }
                    }
                }).catch(e => {
                    if (e && e.message && e.message.match(/This operation must be run in a work tree/)) {
                        return Promise.resolve();
                    }
                    throw e;
                });
            });
        }
        return Promise.resolve();
    }
    load() {
        let p = Promise.resolve();
        if (!this.loaded) {
            p = this.loadMateria();
        }
        return p.then(() => {
            //TODO: need to simplify this.
            if (this.options.runtimes != "core") {
                this.deploy = new Deploy(this);
                let AddonsTools = require('./runtimes/tools/addons');
                this.addonsTools = new AddonsTools(this);
            }
            let beforeLoad = Promise.resolve();
            try {
                this.addons.checkInstalled();
            }
            catch (e) {
                if (this.addonsTools) {
                    console.log("Missing addons, trying to install...");
                    beforeLoad = this.addonsTools.install_all().then(() => {
                        console.log("Addons installed");
                        return Promise.resolve();
                    });
                }
                else {
                    return Promise.reject(e);
                }
            }
            return beforeLoad;
        }).then(() => {
            if (this.database.load()) {
                return this.database.start().then(() => {
                    return this.entities.load();
                });
            }
            else {
                this.logger.log('No database configuration for this application - Continue without Entities');
                return Promise.resolve();
            }
        }).then(() => {
            this.server.load();
            this.api.load();
            return Promise.resolve();
        }).then(() => {
            return this.history.load();
        }).then(() => {
            return this.addons.load();
        }).then(() => {
            if (this.git) {
                return this.git.load();
            }
        });
    }
    _loadMateriaConfig() {
        return new Promise((resolve, reject) => {
            fs.exists(this.path, exists => {
                if (!exists) {
                    return reject(new error_1.default('The application directory has not been found. The folder has been moved or removed'));
                }
                fs.exists(path.join(this.path, 'materia.json'), exists => {
                    if (!exists) {
                        return reject(new error_1.default('materia.json does not exists', {
                            debug: `A minimal materia.json file should look like this:
{
	name: 'nameOfYourApplication'
}`
                        }));
                    }
                    fs.readFile(path.join(this.path, 'materia.json'), 'utf8', (err, conf) => {
                        if (err) {
                            return reject(new Error('Could not load materia.json'));
                        }
                        let confJson;
                        try {
                            confJson = JSON.parse(conf);
                        }
                        catch (e) {
                            return reject(new Error('Could not parse materia.json. The JSON seems invalid'));
                        }
                        return resolve(confJson);
                    });
                });
            });
        });
    }
    saveMateria(opts) {
        if (opts && opts.beforeSave) {
            opts.beforeSave('materia.json');
        }
        if (this.infos.addons && Object.keys(this.infos.addons).length == 0) {
            delete this.infos.addons;
        }
        fs.writeFileSync(path.join(this.path, 'materia.json'), JSON.stringify(this.infos, null, '\t'));
        if (opts && opts.afterSave) {
            opts.afterSave();
        }
    }
    /**
    Set the a value in materia app configuration
    @param {string} - The configuration key
    @param {value} - The value to set
    */
    updateInfo(key, value) {
        if (key == "name") {
            this.name = this.infos.name = value;
        }
        else {
            this.infos[key] = value;
        }
    }
    /**
    Starts the materia app
    */
    start() {
        let p = this.database.started ? Promise.resolve() : this.database.start();
        return p.catch((e) => {
            e.errorType = 'database';
            throw e;
        }).then(() => {
            return this.entities.start().catch((e) => {
                e.errorType = 'entities';
                throw e;
            });
        }).then(() => {
            return this.addons.start().catch((e) => {
                e.errorType = 'addons';
                throw e;
            });
        }).then(() => {
            if (this.mode == AppMode.PRODUCTION && !this.live) {
                return this.synchronizer.diff().then((diffs) => {
                    if (diffs && diffs.length == 0) {
                        return;
                    }
                    this.logger.log('INFO: The database structure differs from entities. Syncing...');
                    return this.synchronizer.entitiesToDatabase(diffs, {}).then((actions) => {
                        this.logger.log(`INFO: Successfully updated the database. (Applied ${actions.length} actions)`);
                    });
                }).catch((e) => {
                    e.errorType = 'sync';
                    throw e;
                });
            }
        }).then(() => {
            return this.server.start().catch((e) => {
                e.errorType = 'server';
                throw e;
            });
        }).then(() => {
            this.status = true;
        });
    }
    /**
    Stops the materia app
    */
    stop() {
        return this.server.stop().then(() => {
            return this.database.stop();
        }).then(() => {
            this.status = false;
        });
    }
    _getFile(file, p) {
        return new Promise((resolve, reject) => {
            fs.lstat(path.join(p, file), (err, stats) => {
                if (err) {
                    return reject(err);
                }
                if (stats.isDirectory()) {
                    this.getAllFiles(file, path.join(p, file)).then((res) => {
                        resolve(res);
                    }).catch((e) => {
                        reject(e);
                    });
                }
                else {
                    resolve({
                        filename: file,
                        path: p,
                        fullpath: path.join(p, file)
                    });
                }
            });
        });
    }
    getAllFiles(name, p) {
        name = name || this.name;
        p = p || this.path;
        //let results = []
        return new Promise((resolve, reject) => {
            fs.readdir(p, (err, files) => {
                let promises = [];
                if (err) {
                    return reject(err);
                }
                files.forEach((file) => {
                    if (file != '.DS_Store' &&
                        file != '.git' &&
                        file != 'history.json' &&
                        file != 'history' &&
                        file != 'node_modules' &&
                        file != 'bower_components' &&
                        file != '_site') {
                        promises.push(this._getFile(file, p));
                    }
                });
                Promise.all(promises).then((results) => {
                    resolve({
                        filename: name,
                        path: p,
                        fullpath: p,
                        children: results
                    });
                }, (reason) => {
                    reject(reason);
                });
            });
        });
    }
    getFiles(depth, name, p) {
        name = name || this.name;
        p = p || this.path;
        let results = [];
        if (depth) {
            let files = fs.readdirSync(p);
            files.forEach((file) => {
                if (file != '.DS_Store' && file != '.git' && file != 'history.json' && file != 'history') {
                    let stats = fs.lstatSync(path.join(p, file));
                    if (stats.isDirectory()) {
                        results.push(this.getFiles(depth - 1, file, path.join(p, file)));
                    }
                    else {
                        results.push({
                            filename: file,
                            path: p,
                            fullpath: path.join(p, file)
                        });
                    }
                }
            });
        }
        return {
            filename: name,
            path: p,
            fullpath: p,
            children: results,
            incomplete: !depth
        };
    }
    initializeStaticDirectory(opts) {
        if (opts && opts.beforeSave) {
            opts.beforeSave('web');
        }
        if (!fs.existsSync(path.join(this.path, 'web'))) {
            fs.mkdirSync(path.join(this.path, 'web'));
        }
        if (!fs.existsSync(path.join(this.path, 'web', 'index.html'))) {
            fs.appendFileSync(path.join(this.path, 'web', 'index.html'), `<!DOCTYPE html>
<html lang="en">
<head>
	<meta charset="UTF-8">
	<title>Document</title>
</head>
<body>
	<h1>Hello world!</h1>
</body>
</html>`);
        }
        if (opts && opts.afterSave) {
            opts.afterSave();
        }
    }
    _getWatchableFiles(files) {
        let res = [];
        for (let file of files) {
            if (!Array.isArray(file.children)) {
                let filenameSplit = file.filename.split('.');
                if (['json', 'js', 'coffee', 'sql'].indexOf(filenameSplit[filenameSplit.length - 1]) != -1) {
                    res.push(file);
                }
            }
            else {
                let t = this._getWatchableFiles(file.children);
                t.forEach((a) => { res.push(a); });
            }
        }
        return res;
    }
    getWatchableFiles() {
        let files = this.getFiles(5);
        return this._getWatchableFiles(files.children);
    }
    readFile(fullpath) {
        return fs.readFileSync(fullpath, 'utf8');
    }
    saveFile(fullpath, content, opts) {
        let p = Promise.resolve();
        if (opts && opts.beforeSave) {
            opts.beforeSave(path.relative(this.path, fullpath));
        }
        if (opts && opts.mkdir) {
            p = new Promise((accept, reject) => {
                mkdirp(path.dirname(fullpath), (err) => {
                    if (err) {
                        return reject(err);
                    }
                    accept();
                });
            });
        }
        return p.then(() => {
            fs.writeFileSync(fullpath, content);
            if (opts && opts.afterSave) {
                opts.afterSave();
            }
        }).catch((e) => {
            if (opts && opts.afterSave) {
                opts.afterSave();
            }
            throw e;
        });
    }
    getMateriaVersion() {
        let pkg = require('../../package');
        return pkg.version;
    }
    installLive() {
        let gitConfig = this.server.getConfig(AppMode.PRODUCTION, server_1.ConfigType.GIT);
        if (!gitConfig || !gitConfig.remote || !gitConfig.branch) {
            return Promise.reject(new Error('Missing git configuration for production mode.'));
        }
        return this.git.copyCheckout({
            path: this.path,
            to: path.resolve(this.path, '.materia', 'live'),
            remote: gitConfig.remote,
            branch: gitConfig.branch
        });
    }
}
Object.defineProperty(exports, "__esModule", { value: true });
exports.default = App;
//# sourceMappingURL=app.js.map