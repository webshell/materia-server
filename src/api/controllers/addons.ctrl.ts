import { App } from '../../lib';
import { WebsocketInstance } from '../../lib/websocket';
import * as fse from 'fs-extra';

export class AddonsController {
	constructor(private app: App, websocket: WebsocketInstance) {}

	getConfig(req, res) {
		const pkg = this.getPkgFromRequest(req);
		if (! pkg || ! this.app.addons.get(pkg)) {
			res.status(404).send();
		} else {
			const config = this.app.addons.addonsConfig && this.app.addons.addonsConfig[pkg] ? this.app.addons.addonsConfig[pkg] : null;
			res.status(200).send(config);
		}
	}

	setup(req, res) {
		this.app.watcher.disable();
		const pkg = this.getPkgFromRequest(req);
		if (! pkg || ! this.app.addons.get(pkg)) {
			res.status(404).send();
		} else {
			this.app.addons.setConfig(pkg, req.body).then(result => {
				this.app.watcher.enable();
				res.status(200).json(result);
			}).catch(err => {
				this.app.watcher.enable();
				res.status(500).json(err);
			});
		}
	}

	enable(req, res) {
		const pkg = this.getPkgFromRequest(req);
		if (! pkg || ! this.app.addons.get(pkg)) {
			res.status(404).send();
		} else {
			this.app.addons.get(pkg).enable().then(() =>
				res.status(200).send()
			).catch(e => res.status(500).json(e));
		}
	}

	disable(req, res) {
		const pkg = this.getPkgFromRequest(req);
		if (! pkg || ! this.app.addons.get(pkg)) {
			res.status(404).send();
		} else {
			this.app.addons.get(pkg).disable().then(() =>
				res.status(200).send()
			).catch(e => res.status(500).json(e));
		}
	}

	bundle(req, res) {
		const pkg = this.getPkgFromRequest(req);
		if (! pkg || ! this.app.addons.get(pkg)) {
			res.status(404).send();
		} else {
			return fse.readFile(this.app.addons.get(pkg).getBundlePath()).then((bundle) =>
				res.status(200).send(bundle)
			).catch((err) => res.status(500).send(err));

		}
	}

	private getPkgFromRequest(req) {
		let pkg = req.params.pkg;
		if (req.params[0]) {
			pkg += req.params[0];
		}
		return pkg;
	}
}