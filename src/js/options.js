/**
 * Created by Xiantank on 2016/5/22.
 */
"use strict";

window.onload = init;
let gdrive;
function saveTypeElementFactory() {
	let saveTypeElement = document.querySelector("#saveType");
	let saveTypeOptions = ["png", "mhtml"];
	let makeSaveTypeOptions = function (saveType, optionsArray) {
		optionsArray.forEach((option)=> {
			saveType.add(new Option(option, option));
		});
	};
	makeSaveTypeOptions(saveTypeElement, saveTypeOptions);
	saveTypeElement.addEventListener("change", function (e) {
		setSaveType(this.value);
	});
	return saveTypeElement;
}

function setWaitTimeElementFactory() {
	let waitTimeElement = document.querySelector("#waitTime");
	waitTimeElement.addEventListener("blur", function () {
		let waitTime = parseInt(this.value);
		if (Number.isNaN(waitTime) || waitTime < 2) {
			return;
		}
		setWaitTime(waitTime);
	});
	return waitTimeElement;

}

function accessTokenFactory() {
	let accessGoogleDriveElement = document.querySelector("#accessGoogleDrive");
	accessGoogleDriveElement.addEventListener("click", function () {
		renewToken(true).then(()=> {
			chrome.runtime.sendMessage({action: "initToken"});
		}).catch(e=> {
			console.log(e);
			chrome.runtime.sendMessage({action: "initToken"});
		});


	});
	return accessGoogleDriveElement;
}

function chooseDefaultFolderElementFactory() {
	let accessGoogleDriveElement = document.querySelector("#defaultFolder");
	accessGoogleDriveElement.addEventListener("blur", function () {
		let path = this.value;
		chrome.runtime.sendMessage({action: "resetPath", path: path});
		setDefaultPath(path);
	});
	return accessGoogleDriveElement;
	/* gen UI and interactive choose folder
	 getToken().then(token=> {
	 if (!token) {
	 return renewToken();
	 }
	 gdrive = new GDrive(token);

	 return selectGoogleDrivePath().then(path=> {
	 if (!path) {
	 return;
	 }
	 setDefaultPath(path);
	 chrome.runtime.sendMessage({action: "resetPath", path: path});
	 });

	 });
	 */
}
function init() {

	let saveTypeElement = saveTypeElementFactory();

	let waitTimeElement = setWaitTimeElementFactory();

	let accessGoogleDriveElement = accessTokenFactory();

	let chooseDefaultFolderElement = chooseDefaultFolderElementFactory();
	chromeGet(["saveType", "waitTime", "googleDriveDefaultPath"]).then(results=> {
		saveTypeElement.value = results.saveType || "png";
		waitTimeElement.value = (Number.isInteger(results.waitTime)) ? results.waitTime : 2000;
		chooseDefaultFolderElement.value = results.googleDriveDefaultPath || "";
	});
}
function setSaveType(saveType) {
	chrome.storage.local.set({"saveType": saveType});
}
function setWaitTime(waitTime) {
	chrome.storage.local.set({"waitTime": waitTime});
}

function setDefaultPath(path) {
	chrome.storage.local.set({"googleDriveDefaultPath": path});
}