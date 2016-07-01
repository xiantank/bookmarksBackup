"use strict";


class GDrive {
	/**
	 *
	 * @param {string || object} token
	 * @param {object} [options]
	 * @param [options.token]
	 * @param [options.defaultPath]
	 * @param [options.renew]
	 */
	constructor(token, options = {}) {
		if (token === undefined) {
			throw "Invalid token";
		}
		if (typeof token === "string") {
			options.token = token;
		} else if (typeof token === "object") {
			options = token;
		}
		this.setToken(options.token);
		this.setDefaultPath(options.defaultPath || `bookmarksBackup${+new Date()}`);
		this.renewToken = options.renew || (() => Promise.reject({error: "GDrive: no renewToken callback function"}));
		this.folderCache = new Map();

	}

	setDefaultPath(path = "") {
		if (path.lastIndexOf("/") !== (path.length - 1 )) {
			path += '/';
		}
		this.defaultPath = path;
	}

	setToken(token) {
		this.token = token || "";
	}

	create(path = "", blobFile, fileMeta = {}) {
		if (typeof path === "string") {
			path = this.defaultPath + path;
			path = path.split("/").filter((p)=>(p !== ""));
		}
		if (!fileMeta.name) {
			fileMeta.name = path.pop() || "";
		}
		return this.findFolder(path).then(parentId=> {
			fileMeta.parents = parentId;
			return this.insertFile(blobFile, fileMeta);
		}).catch(e=> {
			console.log(e);
			return e;
		});
	}

	findFolder(pathArray, prefixPath = "") {
		let path = prefixPath;
		let parentId = "root";
		let currentId;
		let currentFolderPosition;
		if (pathArray.length === 0) {
			return Promise.resolve("root");
		}
		for (currentFolderPosition = pathArray.length; currentFolderPosition > 0; currentFolderPosition--) {
			//path += "/" + pathArray[i];
			path = pathArray.slice(0, currentFolderPosition).join("/");
			if (currentId = this.folderCache.get(path)) {
				parentId = currentId;
				prefixPath = path;
				break;
			} else {
				if (currentId === null) {
					return new Promise((resolve)=> {
						let timer = setInterval(()=> {
							if (currentId = this.folderCache.get(path)) {
								clearInterval(timer);
								resolve(currentId);
							}
						}, 500);
					});
				}
				if (!this.folderCache.has(path)) {
					this.folderCache.set(path, null);
				}
			}
		}
		return this.findAndBuildFolders(pathArray.slice(currentFolderPosition), parentId, pathArray.slice(0, currentFolderPosition));
	}

	findAndBuildFolders(pathArray, parentId, prefixArray = []) {
		prefixArray = prefixArray.slice(0).filter(text=>(text !== ""));
		pathArray = pathArray.slice();

		let target = pathArray.shift();
		if (target) {
			if (!parentId) {
				parentId = this.folderCache.get(prefixArray.join("/"));
			}
			return (this.listFoldersInFolder(parentId)).then(folders=> {
				let targetId;
				let isTargetExist = !folders.files.every((folder)=> {
					if (folder.name !== target) {
						return true;
					} else {
						targetId = folder.id;
						return false;
					}
				});
				if (isTargetExist) {
					prefixArray.push(target);
					return this.findAndBuildFolders(pathArray, targetId, prefixArray);
				} else {
					// create folder and find continue
					return this.createFolder(target, parentId).then(folder=> {
						this.folderCache.set([].concat(prefixArray, target).join("/"), folder.id);
						prefixArray.push(target);
						return this.findAndBuildFolders(pathArray, folder.id, prefixArray);
					});
				}
			});
		} else {
			return Promise.resolve(parentId);
		}
	}

	listFoldersInFolder(parents = "") {
		let parentsCondition = (parents) ? `and"${parents}" in parents` : "";
		return this.buildGoogleAPI({
			path: "/drive/v3/files",
			params: {
				q: `not trashed and mimeType="application/vnd.google-apps.folder"${parentsCondition}`,
				fields: `files(id,name,parents)`
			}
		});
	}

	/**
	 * Insert new file
	 * @param {Blob} blobData File object to read data from.
	 * @param meta
	 * @returns {Promise}
	 */

	insertFile(blobData, meta = {}) {
		return new Promise((resolve)=> {
			const boundary = '-------314159265358979323846';
			const delimiter = "\r\n--" + boundary + "\r\n";
			const closeDelimiter = "\r\n--" + boundary + "--";

			var reader = new FileReader();
			reader.readAsDataURL(blobData);
			reader.onload = () => {
				var contentType = blobData.type || meta.mimeType || 'application/octet-stream';
				var metadata = {
					'mimeType': contentType
				};
				if (meta.parents) {
					metadata.parents = (Array.isArray(meta.parents)) ? meta.parents : [meta.parents];
				}
				metadata = Object.assign(meta, metadata);

				var base64Data = reader.result;
				base64Data = base64Data.replace(/^data:.*?;base64,/, "");
				var multipartRequestBody =
					delimiter +
					'Content-Type: application/json\r\n\r\n' +
					JSON.stringify(metadata) +
					delimiter +
					'Content-Type: ' + contentType + '\r\n' +
					'Content-Transfer-Encoding: base64\r\n' +
					'\r\n' +
					base64Data +
					closeDelimiter;

				return this.buildGoogleAPI({
					'path': '/upload/drive/v3/files',
					'method': 'POST',
					'params': {'uploadType': 'multipart'},
					'headers': {
						'Content-Type': 'multipart/related; boundary="' + boundary + '"'
					},
					'body': multipartRequestBody
				}).then(response=>resolve(response));
			}
		});
	}

	createFolder(folderName, parents) {
		let fileMetadata = {
			'name': folderName,
			'mimeType': 'application/vnd.google-apps.folder'
		};
		if (parents) {
			fileMetadata.parents = (Array.isArray(parents)) ? parents : [parents];
		}
		let options = {
			'path': '/drive/v3/files',
			'method': 'POST',
			'params': {fields: "id,name,parents"},
			'headers': {
				"Content-Type": "application/json"
			},
			'body': fileMetadata
		};
		return this.buildGoogleAPI(options);
	}

	buildGoogleAPI(request) {
		let url = `https://www.googleapis.com${request.path}`;
		let method = request.method || "GET";
		let params = this.generateUrlParams(request.params);
		if (params) {
			url += '?' + params;
		}
		let headers = request.headers || {};
		if (!headers.Authorization) {
			headers.Authorization = `Bearer ${this.token}`
		}
		let body = request.body;

		let options = {};
		options.method = method;
		options.headers = headers;
		if (body) {
			if (typeof body !== "string") {
				body = JSON.stringify(body);
			}
			options.body = body;
		}


		return fetch(url, options).then((response)=> {
			if (response.status >= 200 && response.status < 300) {
				return response.json();
			} else if (response.status === 401) {
				console.error(response.status, response);
				return this.renewToken().then(token=> {
					this.token = token
				});
			} else {
				console.error(response.status, response);
				response.text().then(text=> {
					console.log(text)
				});
				return Promise.reject(response);
			}
		});
	}


	generateUrlParams(params) {
		let parameters = [];
		for (var key in params) {
			if (params.hasOwnProperty(key)) {
				parameters.push(`${encodeURIComponent(key)}=${encodeURIComponent(params[key])}`);
			}
		}
		parameters = parameters.join('&');
		return parameters;
	}


}
