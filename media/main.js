// @ts-ignore 

// This script will be run within the webview itself
// It cannot access the main VS Code APIs directly.
(function () {
  const vscode = acquireVsCodeApi();

  marked.setOptions({
    renderer: new marked.Renderer(),
    gfm: true,
    tables: true,
    breaks: false,
    pedantic: false,
    sanitize: false,
    smartLists: true,
    smartypants: false,
    highlight: function (code, lang) {
      //使用 highlight 插件解析文档中代码部分
      return hljs.highlightAuto(code, [lang]).value;
    }
  });

  // let ele_read = document.getElementById('read-box');
  // console.log(readMeContent)
  // let text = marked.parse(readMeContent);
  // ele_read.innerHTML = text;

  let receiveData = {
    msgType: 'freeform',
    fileName: 'js'
  }

  // Handle messages sent from the extension to the webview
  window.addEventListener("message", (event) => {
    const message = event.data;
    switch (message.type) {
      case "addQuestion": {
        receiveData = message;
        addQuestion(message.value)
        break;
      }
      case "addAnswer": {
        addAnswer(message.value)
        break;
      }
      case "showInput": {
        showInput(true, message.value)
        break;
      }
    }
  });

  let stopBtn = document.getElementById('stop-response');
  let clearBtn = document.getElementById('clear-msg');
  let loginBtn = document.getElementById('login-btn');

  stopBtn.addEventListener('click', function (e) {
    showInput(true, "已经结束响应，请开始新的问答...")
  })

  clearBtn.addEventListener('click', function (e) {
    vscode.postMessage({
      type: 'clear'
    });
    document.getElementById("chat-box").innerHTML = '';
  })

  loginBtn.addEventListener('click', function (e) {
    vscode.postMessage({
      type: 'loginCursor'
    });
  })

  function showInput(type, msg) {
    let box = document.getElementById('bottom-box');
    let input = document.getElementById('prompt-input');
    if (type) {
      if (msg) {
        let ele_div = document.querySelector('.chat-answer:last-child');
        ele_div.innerText = msg;
      }
      box.style.pointerEvents = 'all';
      stopBtn.style.display = 'none';
    } else {
      box.style.pointerEvents = 'none';
      input.value = '';
      input.blur();
      stopBtn.style.display = 'block';
    }
  }

  function createElement(className) {
    let ele_div = document.createElement('div');
    ele_div.className = className;
    document.getElementById("chat-box").appendChild(ele_div)
    return ele_div;
  }

  function addQuestion(message) {
    showInput(false)
    let ele_div = createElement('chat-question')
    ele_div.innerText = message;
    let ele_div_answer = createElement('chat-answer')
    ele_div_answer.innerText = '正在思考中...';
    window.scrollTo(0, document.body.scrollHeight);
  }

  function addAnswer(content) {
    // 如果是停止响应，不再添加内容
    if (stopBtn.style.display == 'none') {
      return;
    }

    if (receiveData.msgType != 'freeform') {
      const fileSplit = receiveData.fileName.split('.')
      const lang = fileSplit[fileSplit.length - 1]
      content = '```' + lang + '\n' + content + '\n```'
    }

    html = marked.parse(content);
    ele_div = document.querySelector('.chat-answer:last-child')
    ele_div.innerHTML = html

    preBlocks = ele_div.querySelectorAll('pre')

    preBlocks.forEach(preTag => {
      preTag.insertAdjacentHTML('afterbegin',
        `<div class="code-tool">
          <a class="copy-btn" href="javascript:;">复制代码</a>
          <a class="insert-btn" href="javascript:;">插入代码</a>
       </div>`
      );
      let copyBtn = preTag.querySelector('.copy-btn');
      let insertBtn = preTag.querySelector('.insert-btn');
      let codeText = preTag.querySelector('code').innerText;
      copyBtn.addEventListener('click', function (e) {
        e.preventDefault();
        navigator.clipboard.writeText(codeText);
      })
      insertBtn.addEventListener('click', function (e) {
        e.preventDefault();
        vscode.postMessage({
          type: 'codeSelected',
          value: codeText
        });
      })
    });

    window.scrollTo(0, document.body.scrollHeight);

  }

  // Listen for keyup events on the prompt input element
  document.getElementById('prompt-input').addEventListener('keyup', function (e) {
    // If the key that was pressed was the Enter key
    if (e.keyCode === 13) {
      vscode.postMessage({
        type: 'prompt',
        value: this.value
      });
    }
  });
})();