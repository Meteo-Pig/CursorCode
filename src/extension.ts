// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below
import * as vscode from "vscode";
const axios = require("axios").default;
const path = require("path");
const fs = require("fs");
import { v4 as uuidv4 } from "uuid";

type ResponseType =
  | "idk"
  | "freeform"
  | "generate"
  | "edit"
  | "chat_edit"
  | "lsp_edit";

interface CodeBlock {
  fileId: number;
  text: string;
  startLine: number;
  endLine: number;
}

type CodeSymbolType = "import" | "function" | "class" | "variable";
interface CodeSymbol {
  fileName: string;
  name: string;
  type: CodeSymbolType;
}

interface UserMessage {
  sender: "user";
  conversationId: string;
  message: string;
  msgType: ResponseType;
  sentAt: number;
  currentFile: string | null;
  precedingCode: string | null;
  procedingCode: string | null;
  currentSelection: string | null;
  // Other pieces of info encoded
  otherCodeBlocks: CodeBlock[];
  codeSymbols: CodeSymbol[];
  selection: { from: number; to: number } | null;
  maxOrigLine?: number;
}

type BotMessageType =
  | "edit"
  | "continue"
  | "markdown"
  | "multifile"
  | "location"
  | "interrupt"
  | "chat_edit"
  | "lsp_edit";

interface BotMessage {
  sender: "bot";
  sentAt: number;
  type: BotMessageType;
  conversationId: string;
  message: string;
  currentFile: string | null;
  lastToken: string;
  finished: boolean;
  interrupted: boolean;
  rejected?: boolean;
  hitTokenLimit?: boolean;
  maxOrigLine?: number;
  useDiagnostics?: boolean | number;
}

// This method is called when your extension is activated
// Your extension is activated the very first time the command is executed
export function activate(context: vscode.ExtensionContext) {
  // Use the console to output diagnostic information (console.log) and errors (console.error)
  // This line of code will only be executed once when your extension is activated
  console.log('Congratulations, your extension "cursorcode" is now active!');

  // The command has been defined in the package.json file
  // Now provide the implementation of the command with registerCommand
  // The commandId parameter must match the command field in package.json
  let disposable = vscode.commands.registerCommand(
    "cursorcode.helloWorld",
    () => {
      // The code you place here will be executed every time your command is executed
      // Display a message box to the user
      vscode.window.showInformationMessage("Hello World from CursorCode!");
    }
  );

  const provider = new CursorWebviewViewProvider(
    context.extensionUri,
    context.extensionPath
  );

  const curosrDispose = vscode.window.registerWebviewViewProvider(
    "cursorcode.chatView",
    provider,
    {
      webviewOptions: { retainContextWhenHidden: true },
    }
  );

  const menuAsk = vscode.commands.registerTextEditorCommand(
    "cursorcode.conversation",
    (editor: vscode.TextEditor) => {
      // console.log(editor);
      vscode.window
        .showInputBox({ prompt: "主人，您有何吩咐?" })
        .then((value) => {
          const selected = editor.document.getText(editor.selection);
          if (selected) {
            provider.msgType = "edit";
          } else {
            provider.msgType = "generate";
          }
          if (value) {
            provider.message = value!;
            provider.conversation();
            // console.log(value);
          }
        });
    }
  );

  context.subscriptions.push(disposable, menuAsk, curosrDispose);
}

class CursorWebviewViewProvider implements vscode.WebviewViewProvider {
  private _view?: vscode.WebviewView;

  public message: string = "";
  public msgType: ResponseType = "freeform";
  private contextType: string = '"copilot"';

  public pasteOnClick: boolean = true;
  public keepConversation: boolean = true;

  public userMessages: UserMessage[] = [];
  public botMessages: BotMessage[] = [];
  public conversationId: string = "";

  constructor(
    private readonly _extensionUri: vscode.Uri,
    private readonly extensionPath: string
  ) {}

  public resolveWebviewView(
    webviewView: vscode.WebviewView,
    context: vscode.WebviewViewResolveContext,
    _token: vscode.CancellationToken
  ) {
    this._view = webviewView;

    // set options for the webview
    webviewView.webview.options = {
      // Allow scripts in the webview
      enableScripts: true,
      localResourceRoots: [this._extensionUri],
    };

    // set the HTML for the webview
    webviewView.webview.html = this._getHtmlForWebview(webviewView.webview);

    // add an event listener for messages received by the webview
    webviewView.webview.onDidReceiveMessage((data) => {
      switch (data.type) {
        case "codeSelected": {
          // do nothing if the pasteOnClick option is disabled
          if (!this.pasteOnClick) {
            break;
          }

          let code = data.value;
          code = code.replace(/([^\\])(\$)([^{0-9])/g, "$1\\$$$3");

          // insert the code as a snippet into the active text editor
          vscode.window.activeTextEditor?.insertSnippet(
            new vscode.SnippetString(code)
          );
          break;
        }
        case "prompt": {
          this.msgType = "freeform";
          this.message = data.value;
          this.conversation();
        }
        case "clear": {
          this.userMessages = [];
          this.botMessages = [];
          this.conversationId = "";
        }
      }
    });
  }

  /**
   * 获取请求体数据
   * @returns 请求体数据
   */
  public getPayload() {
    const editor = vscode.window.activeTextEditor!;
    if (!editor) {
      vscode.window.showWarningMessage(
        "CursorCode：对话前请先打开一个代码文件!"
      );
      return false;
    }
    const selection = editor.selection;

    // Split the `precedingCode` into chunks of 20 line blocks called `precedingCodeBlocks`
    const blockSize = 20;

    let precedingCodeBlocks = [];
    // 获取选中代码的上文代码
    const precedingCode = editor.document.getText(
      new vscode.Range(new vscode.Position(0, 0), selection.start)
    );
    if (precedingCode) {
      let precedingCodeLines = precedingCode.split("\n");
      for (let i = 0; i < precedingCodeLines.length; i += blockSize) {
        let block = precedingCodeLines.slice(i, i + blockSize);
        precedingCodeBlocks.push(block.join("\n"));
      }
    }

    // Split the `procedingCodeBlocks` into chunks of 20 line blocks called `procedingCodeBlocks`
    let procedingCodeBlocks = [];
    const endLine = editor.document.lineCount - 1;
    const endLineLen = editor.document.lineAt(new vscode.Position(endLine, 0))
      .text.length;
    // 获取选中代码的下文代码
    const procedingCode = editor?.document.getText(
      new vscode.Range(selection.end, new vscode.Position(endLine, endLineLen))
    );
    if (procedingCode) {
      let procedingCodeLines = procedingCode.split("\n");
      for (let i = 0; i < procedingCodeLines.length; i += blockSize) {
        let block = procedingCodeLines.slice(i, i + blockSize);
        procedingCodeBlocks.push(block.join("\n"));
      }
    }

    const filePath = editor.document.fileName;
    const rootPath = path.dirname(filePath);

    const userRequest = {
      // Core request
      message: this.message,
      // Context of the current file
      currentRootPath: rootPath,
      currentFileName: filePath,
      currentFileContents: editor.document.getText(),
      // Context surrounding the cursor position
      precedingCode: precedingCodeBlocks,
      currentSelection:
        editor.document.getText(selection) == ""
          ? null
          : editor.document.getText(selection) ?? null,
      suffixCode: procedingCodeBlocks,
      // Get Copilot values
      copilotCodeBlocks: [],
      // Get user defined values
      customCodeBlocks: [],
      codeBlockIdentifiers: [],
      msgType: this.msgType,
      // Messy, but needed for the single lsp stuff to work
      maxOrigLine: null,
      diagnostics: null,
    };
    const userMessages = [
      ...this.userMessages
        .filter((um: any) => um.conversationId == this.conversationId)
        .slice(0, -1),
    ];
    const botMessages = [
      ...this.botMessages.filter(
        (bm: any) => bm.conversationId == this.conversationId
      ),
    ];
    const data = {
      userRequest,
      userMessages: this.msgType === "freeform" ? userMessages : [],

      botMessages: this.msgType === "freeform" ? botMessages : [],
      //useFour: state.settingsState.settings.useFour === 'enabled',
      contextType: this.contextType,

      rootPath: rootPath,
    };

    // console.log(data);
    return data;
  }

  public async conversation() {
    // console.log(this.message);

    const payload = this.getPayload();
    if (!payload) {
      return;
    }

    // focus gpt activity from activity bar
    if (!this._view) {
      await vscode.commands.executeCommand("cursorcode.chatView.focus");
    } else {
      this._view?.show?.(true);
    }

    this._view?.webview.postMessage({
      type: "addQuestion",
      value: this.message,
      msgType: this.msgType,
      fileName: vscode.window.activeTextEditor?.document.fileName,
    });

    var reqData = {
      method: "POST",
      url: "https://aicursor.com/conversation",
      headers: {
        "accept-language": "zh-CN",
        "content-type": "application/json",
        "user-agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Cursor/0.1.0 Chrome/108.0.5359.62 Electron/22.0.0 Safari/537.36",
      },
      data: payload,
      responseType: "stream",
    };
    const response = await axios.request(reqData);
    const stream = response.data;
    //解析stream
    let isMsg = false;
    let content = "";
    stream.on("data", (data: any) => {
      data = data.toString();
      const lines = data.split("\n");
      // 在编辑器光标处插入代码
      for (let line of lines) {
        if (line.startsWith("data: ")) {
          let jsonString = line.slice(6);
          // console.log(jsonString);
          if (jsonString == "[DONE]") {
            this._view?.webview.postMessage({
              type: "showInput",
              value: null,
            });
            return console.log("done");
          }
          if (jsonString.indexOf("BEGIN_message") != -1) {
            jsonString = jsonString.split("|>")[1] ?? "";
            isMsg = true;
          }
          if (jsonString.indexOf("END_message") != -1) {
            jsonString = jsonString.split("<|")[0];
            // 对话式才计如上下文
            if (this.msgType == "freeform") {
              this.manufacturedConversation(this.message, content);
            }
            isMsg = false;
          }

          if (isMsg) {
            try {
              if (jsonString != '"') {
                content += JSON.parse(jsonString);
              } else {
                continue;
              }
            } catch (e) {
              console.log("出错了", jsonString);
              this._view?.webview.postMessage({
                type: "showInput",
                value: "出错啦，请重试...",
              });
            }

            // Replace all occurrences of "/path/to/file.extension\n" with "file.extension\n"
            const replacePathWithFilename = (text: string) => {
              return text.replace(/```\w:.*?\.(\w+)/g, "```$1\n");
            };

            const replaceRN = (text: string) => {
              return text.replace("\r\n", "\n");
            };

            // console.log(replacePathWithFilename(content))
            let newContent = replacePathWithFilename(replaceRN(content));

            this._view?.webview.postMessage({
              type: "addAnswer",
              value: newContent,
            });
          }
        }
      }
    });

    stream.on("end", () => {
      if (content.length < 5) {
        this._view?.webview.postMessage({
          type: "showInput",
          value: "出错啦，请重试...",
        });
        console.error("异常断开");
      }
    });

    stream.on("error", (err: any) => {
      this._view?.webview.postMessage({
        type: "showInput",
        value: "出错啦，请重试...",
      });
      console.error("异常断开");
    });
  }

  public manufacturedConversation(question: any, answer: string) {
    if (this.conversationId == "") {
      this.conversationId = uuidv4();
    }

    const editor = vscode.window.activeTextEditor!;
    const selection = editor.selection;

    // 获取选中代码的上文代码
    const precedingCode = editor.document.getText(
      new vscode.Range(new vscode.Position(0, 0), selection.start)
    );
    const endLine = editor.document.lineCount - 1;
    const endLineLen = editor.document.lineAt(new vscode.Position(endLine, 0))
      .text.length;
    // 获取选中代码的下文代码
    const procedingCode = editor?.document.getText(
      new vscode.Range(selection.end, new vscode.Position(endLine, endLineLen))
    );

    const newUserMessage: UserMessage = {
      sender: "user",
      sentAt: Date.now(),
      message: question,
      conversationId: this.conversationId,
      otherCodeBlocks: [],
      codeSymbols: [],
      currentFile: editor.document.fileName ?? null,
      precedingCode: precedingCode ?? null,
      procedingCode: procedingCode ?? null,
      currentSelection: editor.document.getText(editor.selection) ?? null,
      // maxOrigLine: null,
      selection: null,
      msgType: "freeform",
    };

    this.userMessages.push(newUserMessage);

    const newBotMessage: BotMessage = {
      sender: "bot",
      sentAt: Date.now(),
      type: "markdown",
      conversationId: this.conversationId,
      lastToken: "",
      message: answer,
      finished: true,
      currentFile: null,
      interrupted: false,
      // maxOrigLine: null,
    };

    this.botMessages.push(newBotMessage);
    // Ready for another message in this conversation
    // chatState.draftMessages[newConversationId] = {
    //   ...newUserMessage,
    //   message: "",
    // };
  }

  private _getHtmlForWebview(webview: vscode.Webview) {
    const scriptUri = webview.asWebviewUri(
      vscode.Uri.joinPath(this._extensionUri, "media", "main.js")
    );
    const tailwindUri = webview.asWebviewUri(
      vscode.Uri.joinPath(
        this._extensionUri,
        "media",
        "scripts",
        "tailwind.min.js"
      )
    );
    const markeddUri = webview.asWebviewUri(
      vscode.Uri.joinPath(
        this._extensionUri,
        "media",
        "scripts",
        "marked.min.js"
      )
    );
    const highlightUri = webview.asWebviewUri(
      vscode.Uri.joinPath(
        this._extensionUri,
        "media",
        "scripts",
        "highlight.min.js"
      )
    );
    const highlighDefualtUri = webview.asWebviewUri(
      vscode.Uri.joinPath(
        this._extensionUri,
        "media",
        "css",
        "highligh.style.css"
      )
    );
    const leftSideStyleUri = webview.asWebviewUri(
      vscode.Uri.joinPath(
        this._extensionUri,
        "media",
        "css",
        "leftSideStyle.css"
      )
    );

    // const filePath = path.join(this.extensionPath, 'resources', 'read.md');
    // const readMe = fs.readFileSync(filePath, 'utf8');
    // console.log(readMe)

    return `<!DOCTYPE html>
    <html lang="en">
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">

      <script src="${tailwindUri}"></script>
      <script src="${highlightUri}"></script>
      <script src="${markeddUri}"></script>
      <link rel="stylesheet" href="${highlighDefualtUri}">
      <link rel="stylesheet" href="${leftSideStyleUri}">
    </head>
    <body>
      <div id="read-box">
        <p style="font-size: 1.6em">欢迎使用CursorCode</p>
        <p>对话会话：在下方输入框中输入问题</p>
        <p>代码生成：右键代码框,在菜单中点击CourseCode选项输入需求</p>
        <p>代码优化：在代码框中选中代码,右键在菜单中点击CourseCode选项，在上方弹出的输入框中输入需求</p>
        <p>代码优化：在代码框中选中代码，在下方输入框中输入需求</p>
        <p>插入代码：在对话框中生成的代码，点击代码可插入到代码框中的光标处</p>
        <p>Tips：如果出现空白，没有回答内容的情况，请直接点击停止响应</p>
        <p>Github：https://github.com/Meteo-Pig/CursorCode</p>
      </div>

      <div id="chat-box" class="pt-6 text-sm">请输入你的问题：</div>
      <div class="response-box"><button id="stop-response">停止响应</button></div>
      <div style="height: 80px;"></div>

      <div id="bottom-box">
        <button id="clear-msg">清除会话</button>
        <input class="h-10 w-full p-4 text-sm" type="text" id="prompt-input" placeholder="请输入你的问题..."/>
      </div>
    </body>
    <script src="${scriptUri}"></script>
    </html>`;
  }
}

// This method is called when your extension is deactivated
export function deactivate() {}
