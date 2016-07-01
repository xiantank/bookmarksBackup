"use strict";


let downloadTimer;
let waitTime = 2000;
let saveType = "mhtml";
let bookmarksCache = new Set();
let pagesCache = new Set();
let gdrive;
const dataType = {
    png: {
        base64Prefix: "data:image/png;base64,",
        mime: "image/png",
        extension: ".png"
    },
    mhtml: {
        mime: "multipart/related",
        extension: ".mhtml"
    }
};
function refreshConfig() {
    return new Promise((resolve)=> {
        chromeGet(["waitTime", "saveType", "googleDriveDefaultPath"]).then(results=> {
            waitTime = (Number.isInteger(results.waitTime)) ? results.waitTime : 2000;
            if (waitTime < 1500) {
                waitTime = 1500;
            }
            saveType = results.saveType || "png";
            if (results.googleDriveDefaultPath) {
                gdrive.setDefaultPath(results.googleDriveDefaultPath);
            }
            resolve({waitTime, saveType});
        });
    });
}

chrome.contextMenus.create({
    "title": "download bookmarks",
    "contexts": ["browser_action"],
    "onclick": function () {
        refreshConfig().then((results)=> {
            bookmarkDownloader(results.saveType);
        });
    }
});
chrome.contextMenus.create({
    "title": "force stop", // TODO
    "contexts": ["browser_action"],
    "onclick": function () {
    }
});
chrome.browserAction.onClicked.addListener(function (tab) {
    refreshConfig().then(()=> {
        if (saveType === "mhtml") {
            let title = tab.title;
            var getByMhtml = function (tabId) {
                return new Promise(resolve=> {
                    chrome.pageCapture.saveAsMHTML({tabId: tabId}, function (mhtmlBlob) {
                        if (chrome.runtime.lastError) {
                            console.error(chrome.runtime.lastError);
                            return;
                        }
                        let filePath = title.replace(/\/+|\?/g, "_") + ".mhtml";
                        filePath = preventDuplicateName(pagesCache, filePath);
                        gdrive.create(filePath, mhtmlBlob, {mimeType: "multipart/related"});
                        resolve(tabId);
                    });
                });
            };
            return getByMhtml(tab.id);
        }
        chrome.tabs.sendMessage(tab.id, {action: saveType, path: ""}, function (res) {
            if (chrome.runtime.lastError) {
                console.error(chrome.runtime.lastError);
                return;
            }
            console.log(res);
            let filePath = res.path;
            filePath = preventDuplicateName(pagesCache, filePath);
            gdrive.create(filePath, res.picture, {mimeType: dataType[saveType].mime});
        });
    });
});


function bookmarkDownloader(saveAction = "mthml") {
    //saveAction = "png";
    //saveAction = "mhtml";
    let failLog = [];
    bookmarksTraversal().then(bookmarks=> {
        bookmarks.reduce(
            (p, bookmark) => {
                return p.then(function () {
                    return new Promise(resolve=> {
                        let completeTabs = new Set();
                        let targetTabId;
                        let updatedListener = function (tabId, info, tab) {
                            if (info.status && (info.status == "complete")) {
                                completeTabs.add(tabId);
                                if (targetTabId !== undefined && tabId === targetTabId) {
                                    chrome.tabs.onUpdated.removeListener(updatedListener);
                                    return downloadPage(targetTabId);
                                }
                            }
                        };
                        chrome.tabs.onUpdated.addListener(updatedListener);
                        let downloadPage = function (tabId) {
                            let getPicture = function (tabId) {
                                chrome.tabs.sendMessage(tabId, {
                                    action: saveAction,
                                    path: bookmark.path,
                                    title: bookmark.title,
                                    closeTab: true
                                }, function (res) {
                                    if (chrome.runtime.lastError) {
                                        return resolve(tabId);
                                    }
                                    console.log(res);
                                    let filePath = res.path || bookmark.title;
                                    filePath = preventDuplicateName(bookmarksCache, filePath);
                                    gdrive.create(filePath, res.picture, {mimeType: dataType[saveType].mime});
                                    resolve(tabId);
                                })
                            };
                            let getByMhtml = function (tabId) {
                                chrome.pageCapture.saveAsMHTML({tabId: tabId}, function (mhtmlBlob) {
                                    if (chrome.runtime.lastError) {
                                        let filePath = bookmark.path + ( bookmark.title + dataType[saveType].extension);
                                        failLog.push(filePath);
                                        console.log(filePath, chrome.runtime.lastError);

                                    }
                                    let filePath = bookmark.path + ( bookmark.title + dataType[saveType].extension).replace(/\/+|\?/g, "_");
                                    filePath = preventDuplicateName(bookmarksCache, filePath);
                                    gdrive.create(filePath, mhtmlBlob, {mimeType: "multipart/related"});
                                    resolve(tabId);
                                });
                            };
                            if (saveAction === "mhtml") {
                                getByMhtml(tabId);
                            } else if (saveAction === "png") {
                                getPicture(tabId);
                            }

                        };
                        chrome.tabs.create({url: bookmark.url, selected: false}, (tab)=> {
                            let tabId = tab.id;
                            targetTabId = tabId;
                            if (completeTabs.has(tabId)) {
                                return downloadPage(tabId);
                            }
                            downloadTimer = setTimeout(function () {
                                if (chrome.tabs.onUpdated.hasListener(updatedListener)) {
                                    chrome.tabs.onUpdated.removeListener(updatedListener);
                                    console.log(tab.title,"byTimeout");
                                    downloadPage(tabId);
                                }
                            }, waitTime);
                        })
                    }).catch(error=> {
                        console.log(error);
                    }).then(tabId=> {
                        chrome.tabs.remove(tabId);
                    });
                })
            }, Promise.resolve()
        ).then(()=> {
            console.log("download finish");
            console.log("fail files: ", failLog);
        });
    });
}
function bookmarksTraversal() {
    return new Promise((resolve=> {
        var traversal = function (bookmarks, currentPath, queue) {
            for (let bookmark of bookmarks) {
                if (bookmark.children) { // this is directory
                    queue.concat(traversal(bookmark.children, `${currentPath}${bookmark.title.replace(/\/+|\?+/g, "_")}/`, queue));
                } else { // bookmark
                    queue.push({
                        title: bookmark.title || bookmark.url,
                        url: bookmark.url,
                        path: currentPath
                    });
                }
            }
            return queue;
        };
        chrome.bookmarks.getTree(function (bookmarks) {
            let queue = traversal(bookmarks, "", []);
            resolve(queue);
        });
    }));
}

function initToken(isInteractive = true) {
    return getToken(isInteractive).then(token=> {
        gdrive.setToken(token);
    });
}
function init() {
    gdrive = new GDrive({renew: renewToken});
    initToken();
    chrome.runtime.onMessage.addListener(function (request) {
        if (request.action === "initToken") {
            renewToken(false).then(token=> {
                if (token) {
                    gdrive.setToken(token);
                }
            });
        } else if (request.action === "resetPath") {
            gdrive.setDefaultPath(request.path);
        }
    })
}
init();
