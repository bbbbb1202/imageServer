#!/usr/bin/env node
/*
 * jQuery File Upload Plugin Node.js Example 2.1.0
 * https://github.com/blueimp/jQuery-File-Upload
 *
 * Copyright 2012, Sebastian Tschan
 * https://blueimp.net
 *
 * Licensed under the MIT license:
 * http://www.opensource.org/licenses/MIT
 */

/*jslint nomen: true, regexp: true, unparam: true, stupid: true */
/*global require, __dirname, unescape, console */

(function (port) {
    'use strict';
	Date.prototype.format = function(fmt) { 
		var o = { 
			"M+" : this.getMonth()+1,                 //月份 
			"d+" : this.getDate(),                    //日 
			"h+" : this.getHours(),                   //小时 
			"m+" : this.getMinutes(),                 //分 
			"s+" : this.getSeconds(),                 //秒 
			"q+" : Math.floor((this.getMonth()+3)/3), //季度 
			"S"  : this.getMilliseconds()             //毫秒 
		}; 
		if(/(y+)/.test(fmt)) {
            fmt=fmt.replace(RegExp.$1, (this.getFullYear()+"").substr(4 - RegExp.$1.length)); 
		}
		for(var k in o) {
			if(new RegExp("("+ k +")").test(fmt)){
				fmt = fmt.replace(RegExp.$1, (RegExp.$1.length==1) ? (o[k]) : (("00"+ o[k]).substr((""+ o[k]).length)));
			}
		}
		return fmt; 
	}
    var path = require('path'),
        fs = require('fs'),
        // Since Node 0.8, .existsSync() moved from path to fs:
        _existsSync = fs.existsSync || path.existsSync,
        formidable = require('formidable'),
        nodeStatic = require('node-static'),
        imageMagick = require('imagemagick'),
        options = {
            tmpDir: __dirname + '/tmp',
            publicDir: __dirname + '/public',
            uploadDir: __dirname + '/public/files',
            uploadUrl: '/files/',
            maxPostSize: 20 * 1024 * 1024, // 20 MB
            minFileSize: 1024,
            maxFileSize: 20 * 1024 * 1024, // 20 MB
            acceptFileTypes: /.+/i,
            // Files not matched by this regular expression force a download dialog,
            // to prevent executing any scripts in the context of the service domain:
            inlineFileTypes: /\.(gif|jpe?g|png)$/i,
            imageTypes: /\.(gif|jpe?g|png)$/i,
            imageVersions: {
                'thumbnail': {
                    width: 200,
                    height: 200
                },
				'middle': {
				   width: 600,
				   height: 600
				}
            },
            accessControl: {
                allowOrigin: '*',
                allowMethods: 'OPTIONS, HEAD, GET, POST, PUT, DELETE',
                allowHeaders: 'Content-Type, Content-Range, Content-Disposition'
            },
            /* Uncomment and edit this section to provide the service via HTTPS:
            ssl: {
                key: fs.readFileSync('/Applications/XAMPP/etc/ssl.key/server.key'),
                cert: fs.readFileSync('/Applications/XAMPP/etc/ssl.crt/server.crt')
            },
            */
            nodeStatic: {
                cache: 3600 // seconds to cache served files
            }
        },
        utf8encode = function (str) {
            return unescape(encodeURIComponent(str));
        },
        fileServer = new nodeStatic.Server(options.publicDir, options.nodeStatic),
        nameCountRegexp = /(?:(?: \(([\d]+)\))?(\.[^.]+))?$/,
        nameCountFunc = function (s, index, ext) {
            return ' (' + ((parseInt(index, 10) || 0) + 1) + ')' + (ext || '');
        },
        FileInfo = function (file) {
            this.name = file.name;
            this.size = file.size;
            this.type = file.type;
            this.deleteType = 'DELETE';
        },
        UploadHandler = function (req, res, callback) {
            this.req = req;
            this.res = res;
            this.callback = callback;
        },
        serve = function (req, res) {
            res.setHeader(
                'Access-Control-Allow-Origin',
                options.accessControl.allowOrigin
            );
            res.setHeader(
                'Access-Control-Allow-Methods',
                options.accessControl.allowMethods
            );
            res.setHeader(
                'Access-Control-Allow-Headers',
                options.accessControl.allowHeaders
            );
            var handleResult = function (result, redirect) {
                    if (redirect) {
                        res.writeHead(302, {
                            'Location': redirect.replace(
                                /%s/,
                                encodeURIComponent(JSON.stringify(result))
                            )
                        });
                        res.end();
                    } else {
                        res.writeHead(200, {
                            'Content-Type': req.headers.accept
                                .indexOf('application/json') !== -1 ?
                                        'application/json' : 'text/plain'
                        });
                        res.end(JSON.stringify(result));
                    }
                },
                setNoCacheHeaders = function () {
                    res.setHeader('Pragma', 'no-cache');
                    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');
                    res.setHeader('Content-Disposition', 'inline; filename="files.json"');
                },
                handler = new UploadHandler(req, res, handleResult),
				firstOpt = function () {//自己加的部分（判定当前的目录和日期是否匹配，不匹配就创建新的目录，注意要修改options）
					var uploadDir = options.uploadDir;
					var dateStr = new Date().format("yyyyMMdd");
					var nowDir = __dirname + '/public/' + dateStr;
					if(uploadDir != nowDir){
						baseUrl = nowDir;
						if (!fs.existsSync(baseUrl)) {
							fs.mkdirSync(baseUrl);
						}
						var baseUrl = nowDir + '/thumbnail';
						if (!fs.existsSync(baseUrl)) {
							fs.mkdirSync(baseUrl);
						}
						baseUrl = nowDir + '/middle';
						if (!fs.existsSync(baseUrl)) {
							fs.mkdirSync(baseUrl);
						}
						options.uploadDir = nowDir;
						options.uploadUrl = '/' + dateStr + '/';
					}
				};
            switch (req.method) {
            case 'OPTIONS':
                res.end();
                break;
            case 'HEAD':
            case 'GET':
                if (req.url === '/') {
                    setNoCacheHeaders();
                    if (req.method === 'GET') {
                        handler.get();
                    } else {
                        res.end();
                    }
                } else {
                    fileServer.serve(req, res);
                }
                break;
            case 'POST':
				firstOpt();
                setNoCacheHeaders();
                handler.post();
                break;
            case 'DELETE':
                handler.destroy();
                break;
            default:
                res.statusCode = 405;
                res.end();
            }
        };
    fileServer.respond = function (pathname, status, _headers, files, stat, req, res, finish) {
        // Prevent browsers from MIME-sniffing the content-type:
        _headers['X-Content-Type-Options'] = 'nosniff';
        if (!options.inlineFileTypes.test(files[0])) {
            // Force a download dialog for unsafe file extensions:
            _headers['Content-Type'] = 'application/octet-stream';
            _headers['Content-Disposition'] = 'attachment; filename="' +
                utf8encode(path.basename(files[0])) + '"';
        }
        nodeStatic.Server.prototype.respond
            .call(this, pathname, status, _headers, files, stat, req, res, finish);
    };
    FileInfo.prototype.validate = function () {
        if (options.minFileSize && options.minFileSize > this.size) {
            this.error = 'File is too small';
        } else if (options.maxFileSize && options.maxFileSize < this.size) {
            this.error = 'File is too big';
        } else if (!options.acceptFileTypes.test(this.name)) {
            this.error = 'Filetype not allowed';
        }
        return !this.error;
    };
    FileInfo.prototype.safeName = function () {
        var uuid = require('node-uuid');//this.name
        // Prevent directory traversal and creating hidden system files:
        this.name = path.basename(this.name).replace(/^\.+/, '');
        this.name = this.name.split(".")
        if(this.name[this.name.length-1] === 'ipa' || this.name[this.name.length-1] === 'apk'){
            var today = new Date();
            var dd = today.getDate();
            var mm = today.getMonth()+1;
            this.name = 'devzb_'+mm+dd+'.'+this.name[this.name.length-1];
        }else{
            this.name = uuid.v1()+'.'+this.name[this.name.length-1];    
        }
        
        // console.log(JSON.stringify(this.name))
        // Prevent overwriting existing files:
        while (_existsSync(options.uploadDir + '/' + this.name)) {
            this.name = this.name.replace(nameCountRegexp, nameCountFunc);
        }
    };
    FileInfo.prototype.initUrls = function (req) {
        if (!this.error) {
            var that = this, baseUrl = (options.ssl ? 'https://' : 'http://') + req.headers.host + options.uploadUrl;
            this.url = this.deleteUrl = baseUrl + encodeURIComponent(this.name);
            Object.keys(options.imageVersions).forEach(function (version) {
                if (_existsSync(
                        options.uploadDir + '/' + version + '/' + that.name
                    )) {
                    that[version + 'Url'] = baseUrl + version + '/' +
                        encodeURIComponent(that.name);
                }
            });
        }
    };
    UploadHandler.prototype.get = function () {
        var handler = this,
            files = [];
        fs.readdir(options.uploadDir, function (err, list) {
            list.forEach(function (name) {
                var stats = fs.statSync(options.uploadDir + '/' + name),
                    fileInfo;
                if (stats.isFile() && name[0] !== '.') {
                    fileInfo = new FileInfo({
                        name: name,
                        size: stats.size
                    });
                    fileInfo.initUrls(handler.req);
                    files.push(fileInfo);
                }
            });
            handler.callback({files: files});
        });
    };
    UploadHandler.prototype.post = function () {
        var handler = this,
            form = new formidable.IncomingForm(),
            tmpFiles = [],
            files = [],
            map = {},
            counter = 1,
            redirect,
            finish = function () {
                counter -= 1;
                if (!counter) {
                    files.forEach(function (fileInfo) {
                        fileInfo.initUrls(handler.req);
                    });
                    handler.callback({files: files}, redirect);
                }
            };
        form.uploadDir = options.tmpDir;
        form.on('fileBegin', function (name, file) {
            tmpFiles.push(file.path);
            var fileInfo = new FileInfo(file, handler.req, true);
            fileInfo.safeName();
            map[path.basename(file.path)] = fileInfo;
            files.push(fileInfo);
        }).on('field', function (name, value) {
            if (name === 'redirect') {
                redirect = value;
            }
        }).on('file', function (name, file) {
            var fileInfo = map[path.basename(file.path)];
            fileInfo.size = file.size;
            if (!fileInfo.validate()) {
                fs.unlink(file.path);
                return;
            }
            fs.renameSync(file.path, options.uploadDir + '/' + fileInfo.name);
            if (options.imageTypes.test(fileInfo.name)) {
                Object.keys(options.imageVersions).forEach(function (version) {
                    counter += 1;
                    var opts = options.imageVersions[version];
                    imageMagick.resize({
                        width: opts.width,
                        height: opts.height,
                        srcPath: options.uploadDir + '/' + fileInfo.name,
                        dstPath: options.uploadDir + '/' + version + '/' +
                            fileInfo.name
                    }, finish);
                });
            }
        }).on('aborted', function () {
            tmpFiles.forEach(function (file) {
                fs.unlink(file);
            });
        }).on('error', function (e) {
            console.log(e);
        }).on('progress', function (bytesReceived, bytesExpected) {
            if (bytesReceived > options.maxPostSize) {
                handler.req.connection.destroy();
            }
        }).on('end', finish).parse(handler.req);
    };
    UploadHandler.prototype.destroy = function () {
        var handler = this, fileName;
        if (handler.req.url.slice(0, options.uploadUrl.length) === options.uploadUrl) {
            fileName = path.basename(decodeURIComponent(handler.req.url));
            if (fileName[0] !== '.') {
                fs.unlink(options.uploadDir + '/' + fileName, function (ex) {
                    Object.keys(options.imageVersions).forEach(function (version) {
                        fs.unlink(options.uploadDir + '/' + version + '/' + fileName);
                    });
                    handler.callback({success: !ex});
                });
                return;
            }
        }
        handler.callback({success: false});
    };
    if (options.ssl) {
        require('https').createServer(options.ssl, serve).listen(port);
    } else {
        require('http').createServer(serve).listen(port);
    }
}(8888));
