/**
 * Created by Xiantank on 2016/5/21.
 */
"use strict";

function chromeGet(keys) {
	return new Promise((resolve, reject)=> {
		chrome.storage.local.get(keys, function (results) {
			resolve(results);
		});
	});
}

function preventDuplicateName(cache, filePath) {
	if (cache.has(filePath)) {
		let i = 1;
		while (cache.has(`${i}_${filePath}`)) {
			i++;
		}
		filePath = `${i}_${filePath}`;
	}
	cache.add(filePath);
	return filePath;

}

function getToken(isInteractive = true) {
	return new Promise((resolve, reject)=> {
		chrome.identity.getAuthToken({interactive: isInteractive}, (token)=> {
			if (chrome.runtime.lastError) {
				console.error(chrome.runtime.lastError);
				console.log(token);
				return reject(chrome.runtime.lastError);
			}
			resolve(token);
		});
	});
}

function renewToken(isInteractive) {
	return getToken(isInteractive).then(token=> {
		return new Promise((resolve, reject)=> {
			chrome.identity.removeCachedAuthToken({token: token}, function () {
				return resolve(getToken(isInteractive));
			});
		});
	}).catch(e=> {
		return getToken(isInteractive);
	});
}