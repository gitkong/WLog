// @ts-check

// @author gitkong
'use strict';

var dgrm = require("dgram");
var fs = require("fs");
const os = require("os");
const path = require('path');
const express = require('express')

const SOURCE_MARK_IOS = '[_iOS_]';

const DEBUG = false;

var server = dgrm.createSocket("udp4");
const app = express()

/// 重置HTML
const RESET_HTML_MARK = "RESET_HTML_MARK";
/// 设置HTML页面刷新时间
const REFRESH_HTML_INTERVAL_MARK = "REFRESH_HTML_INTERVAL_MARK";
/// 设置HTML页面div自动滚动到底部
const REFRESH_HTML_AUTOSCROLL_MARK = "REFRESH_HTML_AUTOSCROLL_MARK";
/// 关闭socket
const SOCKET_CLOSE_MARK = "SOCKET_CLOSE_MARK";

var sourceHTMLData = null;

const PROCESS_HTML_FILE_PATH = path.join(process.cwd(), "log.html");
var lastLocalFile = null;

const myHost = getIPAdress();

var isConnected = false;

const SERVER_RW_HTML_MARK = false;

var logCacheString = '';
const LOG_SEPARATOR_MARK = '<_sp_>';

if (SERVER_RW_HTML_MARK == true) {
    judgeLogHTMLExist(function(exists) {
        if (exists) {
            monitorInput()
        }
        else {
            console.log('\n检测文件路径不正确，请确认log.html文件存放在：' + PROCESS_HTML_FILE_PATH);
        }
    })
    
    fs.watchFile(PROCESS_HTML_FILE_PATH, (cur, prv) => {
        judgeLogHTMLExist(function(exists) {
            if (exists) {
                if (isConnected == false) {
                    monitorInput()
                }
            }
            else {
                console.log('\n检测文件路径不正确，请确认log.html文件存放在：' + PROCESS_HTML_FILE_PATH);
            }
        })
    })
}
else {
    console.log('\nWLog使用出现问题，可咨询gitkong(孔凡列)\n')
    appConfigGetRequest()
}

function appConfigGetRequest() {
    app.options("/*", function(req, res, next) {
        res.header('Access-Control-Allow-Origin', '*');
        res.header('Access-Control-Allow-Methods', 'GET,PUT,POST,DELETE,OPTIONS');
        res.header('Access-Control-Allow-Headers', 'Content-Type, Authoriz,ation, Content-Length, X-Requested-With');
        res.sendStatus(200);
    });
    
    app.all('*', function(req, res, next) {
        res.header("Access-Control-Allow-Origin", "*");
        next();
    });
    
    app.listen(8080, () => {
        console.log('\n**************** WLog服务启动成功 ****************\n')
        monitorInput()
    })
    
    app.post('/api/getLogs', (req, res) => {
        console.log('server send:' + logCacheString)
        res.send(logCacheString)
    })
}

function judgeLogHTMLExist(callback) {
    fs.exists(PROCESS_HTML_FILE_PATH, callback);
}

function monitorInput() {
    if (!DEBUG) {
        process.stdout.write("检测到你的ip是:" + myHost + ", 回车使用或者输入新的ip:");
        process.stdin.on('data',(buffer)=>{
            var input = buffer.toString();
            input=input.toString().trim();
            // console.log(input + input.length);
            var host = input.length > 0 ? input : myHost;
            if (checkIP(host)) {
                addListener(host);
                process.stdin.pause();
            }
            else {
                process.stdout.write('你输入的ip：' + host + ' 不合法，请重新输入：');
            }
        });
    }
    else {
        addListener(myHost);
    }
}

function addListener(host) {
    // console.log('addListener:' + host);
    server.bind(8300, host, function () {
        // server.setBroadcast(true);
        var address = server.address();
        if (checkIP(address.address)) {
            isConnected = true;
            console.log("服务器开始监听:", address);
        }
        else {
            console.log("服务器开始监听:", address, ',无效IP');
        }
      });
      
      server.addListener("listening", function () {
        // console.log("addListener connect");
        lastLocalFile = PROCESS_HTML_FILE_PATH;
      });

      server.on("message", function (buffer, rinfo) {
        var msg = buffer.toString("utf8");
        if (msg.slice(0, SOURCE_MARK_IOS.length) != SOURCE_MARK_IOS) {
            console.log("已收到其他来源数据：" + msg);
            return;
        }
        
        msg = msg.slice(SOURCE_MARK_IOS.length, msg.length);

        console.log("WLog Recv：" + msg);

        if (SERVER_RW_HTML_MARK == true) {
            serverReadWriteHtmlFileWithMsg(msg)
        }
        else {
            /// 本地记录logs，用户接口回调，类似数据库操作
            if (msg == RESET_HTML_MARK) {
                logCacheString = '';
            }
            else {
                logCacheString += (LOG_SEPARATOR_MARK + msg);
            }
        }
      });
      
      server.on("connect", function () {
        console.log("connect");
      });
      
      server.on("close", function () {
        console.log("close");
        sourceHTMLData = null;
        isConnected = false;
      });
      
      server.on("error", function (error) {
        console.log("error:" + error);
        isConnected = false;
      });
}

function serverReadWriteHtmlFileWithMsg(msg) {
    if (lastLocalFile != PROCESS_HTML_FILE_PATH) {
        console.log('localFile=' + PROCESS_HTML_FILE_PATH);
        lastLocalFile = PROCESS_HTML_FILE_PATH;
      }
      console.log("已收到数据：" + msg);
    
      markSourceHTMLData();
    
      if (msg == RESET_HTML_MARK) {
        resetHtml();
        // TODO:server send clear cmd
        //server.send(RESET_HTML_MARK, null);
      } 
      else if (msg.indexOf(REFRESH_HTML_INTERVAL_MARK) >= 0) {
        let localFile = PROCESS_HTML_FILE_PATH;
        var numStr = msg.slice(REFRESH_HTML_INTERVAL_MARK.length, msg.length);
        var num = parseInt(numStr, 10);
        let testHtml = readFileSafe(localFile);
        if (testHtml == undefined) {
            return;
        }
        /// 变更刷新时间
        var str = "const refreshInterval = " + num + ";";
    
        var str1 = num + "秒刷新一次";
        /// 超过一天认为停止自动刷新
        if (num >= 24 * 60 * 60) {
          str1 = "停止自动刷新";
        }
    
        /// 暂时设置最大10位，太多就只能改代码了。。
        var result = testHtml.replace(
            /const refreshInterval = ([\s\S]){1,10};/g,
            str
        ).replace(
            /([\s\S]){1}秒刷新一次|停止自动刷新/g,
            str1
        );
        fs.writeFileSync(localFile, result, "utf8");
      } 
      else if (msg.indexOf(REFRESH_HTML_AUTOSCROLL_MARK) >= 0) {
        let localFile = PROCESS_HTML_FILE_PATH;
        var numStr = msg.slice(REFRESH_HTML_AUTOSCROLL_MARK.length, msg.length);
        var num = parseInt(numStr, 10);
        var str = "const scrollToBottom = " + num + ";";
        var testHtml = readFileSafe(localFile);
        if (testHtml == undefined) {
          return;
        }
        var result = '';
        if (num <= 0) {
            result = testHtml.replace(
                /自动滚到底<br>/g,
                '你自己滚<br>'
            ).replace(
                /const scrollToBottom = ([\s\S]){1,10};/g,
                str
            );
        }
        else {
            result = testHtml.replace(
                /你自己滚<br>/g,
                '自动滚到底<br>'
            ).replace(
                /const scrollToBottom = ([\s\S]){1,10};/g,
                str
            );
        }
        fs.writeFileSync(localFile, result, "utf8");
      }
      else if (msg == SOCKET_CLOSE_MARK) {
        server.close();
      } else {
        renderToHtml(msg);
      }
}

function readFileSafe(path) {
    try {
        judgeLogHTMLExist(function(exists) {
            if (exists) {
                return fs.readFileSync(path, "utf8");
            }
            else {
                console.log('\n检测文件路径不正确，请确认log.html文件存放在：' + PROCESS_HTML_FILE_PATH);
                return undefined;
            }
        })
         
    } catch (error) {
        console.log("readFileSafe Error:" + error);
        process.exit();
    }
}

function renderToHtml(msg) {
  let localFile = PROCESS_HTML_FILE_PATH;
  var testHtml = readFileSafe(localFile);
  if (testHtml == undefined) {
    return;
  }
  const data = testHtml.split("\n");
//   console.log(data);
  data.splice(data.length - 4, 0, '<div class="log_cell">' + msg + "</div>");
  fs.writeFileSync(localFile, data.join("\n"), "utf8");
}

function markSourceHTMLData() {
  // if (sourceHTMLData == null) {
  //     sourceHTMLData = fs.readFileSync('log.html', 'utf8');
  //     console.log(sourceHTMLData.split('\n'));
  // }
}

function resetHtml() {
  let localFile = PROCESS_HTML_FILE_PATH;
  if (sourceHTMLData) {
    fs.writeFileSync(localFile, sourceHTMLData, "utf8");
  } else {
    var data = [
        '',
        '<style>',
        'body{',
        'background:#f0f0f0; ',
        '}',
        '',
        '.div_celebrity_list{',
        '\twidth:100%;',
        '\theight:60%;',
        '\toverflow-y:scroll;',
        '\tpadding:4px; \t ',
        '\tborder:2px dashed #aaa;',
        '}',
        '',
        '.log_cell {',
        '    font-size:12px;',
        '}',
        '',
        '</style>',
        '',
        '<!DOCTYPE html>',
        '<html lang="en">',
        '<head>',
        '    <title>Log</title>',
        '    <script>',
        '        const refreshInterval = 3;',
        '        const scrollToBottom = 1;',
        '        function htmlRefresh(){',
        '            window.location.reload();',
        '            button_onclick();',
        '        }',
        "        setTimeout('htmlRefresh()',refreshInterval * 1000); //单位为毫秒",
        '',
        '        function button_onclick(){',
        '            // 滚到底部',
        '            if (scrollToBottom == 1) {',
        '                document.getElementById("log_list").scrollTop=1000000;',
        '            }',
        '        }',
        '        function onScrollEvent(){',
        '            window.localStorage.setItem("lastScrollVal", document.getElementById("log_list").scrollTop);',
        '        }',
        '',
        '        window.onload = function () {',
        '            document.getElementById("filter_input").value = window.localStorage.getItem("lastFilterVal");',
        '            document.getElementById("log_list").scrollTop = window.localStorage.getItem("lastScrollVal");',
        '            // 过滤',
        '            let value = document.getElementById("filter_input").value;',
        '            filterHtml(value);',
        '        }',
        '',
        '        function checkField(val){',
        '            window.localStorage.setItem("lastFilterVal", val);',
        '            /// 刷新一次',
        '            htmlRefresh();',
        '        }',
        '',
        '        function filterHtml(value) {',
        "            if (value == '' || value == undefined) {",
        '                return;',
        '            }',
        '            let filter = new RegExp(value);',
        '            var html = document.getElementById("log_list").innerHTML;',
        '            var list = html.split("\\n");',
        '            ',
        '            var resultList = new Array();',
        '            for (var i = 0;i < list.length; i++) { ',
        '                let child = list[i];',
        "                if (child != undefined && child != '') {",
        '                    resultList.push(child);',
        '                }',
        '            }',
        '',
        '            let listNode = document.getElementById("log_list");',
        '            var removeList = new Array();',
        '            /// 下标对应',
        '            for (var i = 0;i < resultList.length; i++) { ',
        '                let child = resultList[i];',
        '                var childNode = listNode.children[i];',
        '                /// 使用 firstChild, lastChild, childeNodes[0] 或类似的节点选取，因为选取的第一个或最后一个必定是空格，也就是#text',
        "                if (child == '' || childNode == undefined) {",
        '                    continue;',
        '                }',
        '                let result = filter.test(childNode.innerText);',
        '                if (!result) {',
        '                    /// 找不到，移除掉',
        '                    removeList.push(childNode);',
        '                }',
        '                else {',
        '                    childNode.style.cssText = "color:blue";',
        '                }',
        '            }',
        '',
        '            for (var i = 0;i < removeList.length; i++) { ',
        '                let childNode = removeList[i];',
        '                listNode.removeChild(childNode);',
        '            }',
        '        }',
        '    </script>',
        '<head>',
        '',
        '',
        '<button type="button" id="add" onclick="javascript:button_onclick();">自动滚到底<br></button>',
        '',
        '<button>3秒刷新一次</button>',
        '',
        '输入过滤: <input type="text" id="filter_input" value="" onchange="checkField(this.value)">',
        '',
      "<body>",
      '<p id="p1">Hello World!</p>',
      "",
      "<div id='btnInterval'></div>",
      "",
      '<div class="div_celebrity_list" data-bind-1="list_data" id="log_list" onscroll= "onScrollEvent()">',
      "",
      "</div>",
      "",
      "</body>",
      "</html>",
    ];
    fs.writeFileSync(localFile, data.join("\n"), "utf8");
  }
}


///获取本机ip///
function getIPAdress() {
  var interfaces = os.networkInterfaces();
  for (var devName in interfaces) {
    var iface = interfaces[devName];
    for (var i = 0; i < iface.length; i++) {
      var alias = iface[i];
      if (
        alias.family === "IPv4" &&
        alias.address !== "127.0.0.1" &&
        !alias.internal
      ) {
        return alias.address;
      }
    }
  }
}

function checkIP(ip){
    var reg = /^(\d{1,2}|1\d\d|2[0-4]\d|25[0-5])\.(\d{1,2}|1\d\d|2[0-4]\d|25[0-5])\.(\d{1,2}|1\d\d|2[0-4]\d|25[0-5])\.(\d{1,2}|1\d\d|2[0-4]\d|25[0-5])$/
    return reg.test(ip);
  }
