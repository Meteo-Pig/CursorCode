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

  stopBtn.addEventListener('click', function (e) {
    showInput(true, "已经结束响应，请开始新的问答...")
  })

  clearBtn.addEventListener('click', function (e) {
    vscode.postMessage({
      type: 'clear'
    });
    document.getElementById("chat-box").innerHTML = '';
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
    if(stopBtn.style.display=='none'){ 
      return;
    }

    if (receiveData.msgType != 'freeform') {
      const fileSplit = receiveData.fileName.split('.')
      const lang = fileSplit[fileSplit.length - 1]
      content = '```' + lang + '\n' + content + '\n```'
    }
    // console.log(content)
    html = marked.parse(content);
    ele_div = document.querySelector('.chat-answer:last-child')
    ele_div.innerHTML = html

    var preCodeBlocks = document.querySelectorAll("pre code");
    // console.log(preCodeBlocks)
    for (var i = 0; i < preCodeBlocks.length; i++) {
      preCodeBlocks[i].classList.add(
        "p-2",
        "my-2",
        "block",
        "overflow-x-scroll"
      );
    }

    var codeBlocks = document.querySelectorAll('code');
    for (var i = 0; i < codeBlocks.length; i++) {
      // Check if innertext starts with "Copy code"
      // if (codeBlocks[i].innerText.startsWith("Copy code")) {
      //   codeBlocks[i].innerText = codeBlocks[i].innerText.replace("Copy code", "");
      // }

      codeBlocks[i].classList.add("max-w-full", "overflow-hidden", "rounded-sm", "cursor-pointer");

      codeBlocks[i].addEventListener('click', function (e) {
        e.preventDefault();
        vscode.postMessage({
          type: 'codeSelected',
          value: this.innerText
        });
      });
    }

    window.scrollTo(0, document.body.scrollHeight);

    // hljs.highlightAll();

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