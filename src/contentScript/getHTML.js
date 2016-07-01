/**
 * Created by Xiantank on 2016/5/21.
 */
"use strict";
const dataType = {
	png: {
		base64Prefix: "data:image/png;base64,",
		mime: "image/png",
		extension: ".png"
	}
};
let usingType = "png";
chrome.runtime.onMessage.addListener(function (message, sender, sendResponse) {
	if (message.action === "base64png") {
		usingType = message.action;
		html2canvas(document.body).then(canvas=> {
			let base64Picture = canvas.toDataURL(dataType[usingType].mime);
			base64Picture = base64Picture.slice(dataType[usingType].base64Prefix.length);
			sendResponse({
				url: window.location.href,
				format: "base64",
				path: message.path + (( message.title || document.title ) + dataType[usingType].extension).replace(/\/+|\?/g, "_"),
				picture: base64Picture
			});
		});
		return true;
	}
	if (message.action === "png") {
		html2canvas(document.body).then(canvas=> {
			canvas.toBlob(function (blob) {
				sendResponse({
					url: window.location.href,
					format: "blob",
					path: message.path + (( message.title || document.title ) + dataType[usingType].extension).replace(/\/+|\?/g, "_"),
					picture: blob
				});
			});
		});
		return true;
	} else {
		console.log("unknown action", message);
		return false;
	}
});

