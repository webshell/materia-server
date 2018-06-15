// import * as fs from 'fs'
// import * as path from 'path'
// import * as cp from 'child_process'
import * as readline from 'readline'

import { App } from '../../app'

import { MateriaError } from '../../error'
// import { Dependency } from '../../dependency'

//TODO: need to move this in materia-cli to keep materia-server clean
class AddonsTools {
	addons:any

	constructor(private app:App) {
	}

	setup(name:string):Promise<void> {
		return this.app.addons.setupModule((require) => {
			const setupObj = this.app.addons.get(name).getSetupConfig();
			if (setupObj.length == 0) {
				return Promise.resolve()
			}
			const rl = readline.createInterface({
				input: process.stdin,
				output: process.stdout
			})
			const configs: any = this.app.addons.loadConfig();
			let config = configs[name] = configs[name] || {}
			let p = Promise.resolve()
			for (let param of setupObj) {
				p = p.then(() => {
					let description = param.description
					let def = config[param.name] === undefined ? param.default : config[param.name]
					if (param.type == 'boolean') {
						if (def === false) {
							description += ': [y/N] '
						} else {
							description += ': [Y/n] '
							def = true
						}
					} else if (def !== undefined) {
						description += `: (${def}) `
					} else {
						description += ": "
					}

					return new Promise((accept, reject) => {
						rl.question(description, answer => {
							return accept(answer)
						})
					}).then((value:any) => {
						if (value == "") {
							value = def
						}
						else if (param.type == 'boolean') {
							value = value.toLowerCase()[0] == 'y'
						}
						else if (param.type == 'number') {
							value = parseInt(value)
						}
						else if (param.type == 'float') {
							value = parseFloat(value)
						}

						if (param.type == 'date') {
							value = new Date(value)
						}
						if (param.type == 'text') {
							value = value || ""
						}

						config[param.name] = value
					})
				})
			}

			return p.then(() => {
				return this.app.saveFile('.materia/addons.json', JSON.stringify(configs), { mkdir:true })
			}).then(() => {
				rl.close()
			}).catch(e => {
				rl.close()
				throw e
			})
		})
	}

	setup_all():Promise<void> {
		return this.app.addons.searchInstalledAddons().then((addons) => {
			let p = Promise.resolve()
			for (let addon of addons) {
				p = p.then(() => this.setup(addon))
			}
			return p
		})
	}

	search(query) {
		/* Receive addons from npm @materia scope */
		return Promise.reject(new MateriaError('Not implemented yet', { slug: 'addons_search' }))
	}

	/**
	 * Call to npm/yarn using child process
	 * Tried 15000 things and couldn't find a way to make it work in the packaged asar file.
	 */
	/*private buffProc(proc:cp.ChildProcess, callback:(code:number, out:string, err:string)=>void) {
		let out = ""
		let err = ""

		proc.stdout.on('data', data => {
			out += data.toString()
		})
		proc.stderr.on('data', data => {
			err += data.toString()
		})
		proc.on('close', code => {
			callback(code, out, err)
		})
		proc.on('error', err => {
			callback(-1, "", err.message)
		})
	}
	private _postInstall(proc, opts) {
		return new Promise((accept, reject) => {

			this.buffProc(proc, (code, out, err) => {
				if (opts && opts.afterSave) {
					opts.afterSave()
				}
				if (code != 0) {
					let e = new MateriaError('Failed to install/uninstall addons')
					e.debug = err
					this.app.logger.log(` └─ Fail: ${e} (${out}, ${err})`)
					return reject(e)
				}
				this.app.logger.log(' └─ Success!')
				accept()
			})
		})
	}

	private findPath(parent = '..') {
		this.app.logger.log(`trying... ${path.join(__dirname, parent)}`)
		if (fs.existsSync(path.join(__dirname, parent, 'node_modules/.bin/yarn'))) {
			return path.join(__dirname, parent, 'node_modules/.bin/yarn')
		}
		else if (fs.existsSync(path.join(__dirname, parent, 'app.asar.unpacked/node_modules/.bin/yarn'))) {
			return path.join(__dirname, parent, 'app.asar.unpacked/node_modules/.bin/yarn')
		}
		else if (fs.existsSync(path.join(__dirname, parent, 'app.asar/node_modules/.bin/yarn'))) {
			return path.join(__dirname, parent, 'app.asar/node_modules/.bin/yarn')
		}
		else {
			if (path.join(__dirname, parent, 'node_modules/.bin/yarn') == '/node_modules/.bin/yarn') {
				return false
			}
			return this.findPath(parent + '/..')
		}
	}

	private pmCall(yarnParams:string[], opts: ISaveOptions) {
		return Promise.resolve({proc: null, opts: null})
		.then(() => {
			this.app.logger.log(__dirname)

			let p = this.findPath()
			console.log(`found path ${p}`)
			if ( ! p) {
				return Promise.reject(new Error('Yarn not found'))
			}
			else {
				this.app.logger.log(` └─ Run: yarn ${yarnParams.join(' ')}`)
			}
			let proc = cp.exec(`cd ${this.app.path} && ${p} ${yarnParams.join(' ')}`)
			return Promise.resolve({proc: proc, opts: opts})
		})
		.then(data => this._postInstall(data.proc, data.opts))
		.catch(e => {
			this.app.logger.log(` └─ Fail: ${e}`)
			return Promise.reject(e)
		})
	}
*/

}

module.exports = AddonsTools