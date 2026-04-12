const vscode = require('vscode');

/**
 * @param {vscode.ExtensionContext} context
 */
function activate(context) {
	console.log('Congratulations, your extension "meow-cli-extension" is now active!');

	let disposable = vscode.commands.registerCommand('meow-cli.openChat', function () {
		const panel = vscode.window.createWebviewPanel(
			'meowChat',
			'Meow CLI Chat',
			vscode.ViewColumn.One,
			{
				enableScripts: true
			}
		);

		panel.webview.html = getWebviewContent();
	});

	context.subscriptions.push(disposable);

	const provider = new MeowViewProvider(context.extensionUri);
	context.subscriptions.push(
		vscode.window.registerWebviewViewProvider(MeowViewProvider.viewType, provider)
	);
}

class MeowViewProvider {
	static viewType = 'meow-cli-view';

	constructor(extensionUri) {
		this._extensionUri = extensionUri;
	}

	resolveWebviewView(webviewView, context, _token) {
		this._view = webviewView;

		webviewView.webview.options = {
			enableScripts: true,
			localResourceRoots: [this._extensionUri]
		};

		webviewView.webview.html = this._getHtmlForWebview(webviewView.webview);

		webviewView.webview.onDidReceiveMessage(async data => {
			switch (data.type) {
				case 'sendMessage':
					// Mock AI response for now to demonstrate UI
					setTimeout(() => {
						webviewView.webview.postMessage({ 
							type: 'receiveMessage', 
							role: 'ai', 
							text: 'I am processing your request: ' + data.text 
						});
					}, 1000);
					break;
			}
		});
	}

	_getHtmlForWebview(webview) {
		return getWebviewContent();
	}
}

function getWebviewContent() {
	return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Meow CLI</title>
    <style>
        body {
            background-color: #1e1e1e;
            color: #d4d4d4;
            font-family: 'Consolas', 'Courier New', monospace;
            padding: 20px;
            margin: 0;
            display: flex;
            flex-direction: column;
            height: 100vh;
            box-sizing: border-box;
        }
        .header {
            color: #cc7832;
            white-space: pre;
            font-weight: bold;
            margin-bottom: 10px;
            font-size: 14px;
        }
        .subtitle {
            color: #646464;
            margin-bottom: 10px;
        }
        .status-line {
            display: flex;
            gap: 15px;
            color: #646464;
            border-bottom: 1px solid #646464;
            padding-bottom: 10px;
            margin-bottom: 20px;
            font-size: 12px;
        }
        .status-item span {
            color: #cc7832;
        }
        .chat-container {
            flex: 1;
            overflow-y: auto;
            margin-bottom: 20px;
        }
        .input-container {
            display: flex;
            border: 1px solid #646464;
            padding: 5px 10px;
            border-radius: 4px;
        }
        .input-container input {
            background: transparent;
            border: none;
            color: #d4d4d4;
            flex: 1;
            outline: none;
            font-family: inherit;
        }
        .prompt-symbol {
            color: #cc7832;
            margin-right: 10px;
        }
    </style>
</head>
<body>
    <div class="header">
  ╔╦╗╔═╗╔═╗╦ ╦  ╔═╗╦  ╦
  ║║║║╣ ║ ║║║║  ║  ║  ║
  ╩ ╩╚═╝╚═╝╚╩╝  ╚═╝╩═╝╩
    </div>
    <div class="subtitle">Terminal AI Assistant</div>
    <div class="status-line">
        <div class="status-item">model: <span>gemini-3-flash</span></div>
        <div class="status-item">profile: <span>fullstack</span></div>
        <div class="status-item">chat: <span>meowcli</span></div>
    </div>
    <div class="chat-container" id="chat">
        <!-- Messages will appear here -->
    </div>
    <div class="input-container">
        <span class="prompt-symbol">◇</span>
        <input type="text" id="userInput" placeholder="Type /help for commands..." autofocus>
    </div>

    <script>
        const vscode = acquireVsCodeApi();
        const input = document.getElementById('userInput');
        const chat = document.getElementById('chat');

        input.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') {
                const text = input.value;
                if (text) {
                    appendMessage('user', text);
                    vscode.postMessage({ type: 'sendMessage', text });
                    input.value = '';
                }
            }
        });

        function appendMessage(role, text) {
            const div = document.createElement('div');
            div.style.marginBottom = '10px';
            div.innerHTML = \`<span style="color: \${role === 'user' ? '#d4d4d4' : '#cc7832'}">\${role === 'user' ? '❯' : 'meowcli'} </span> \${text}\`;
            chat.appendChild(div);
            chat.scrollTop = chat.scrollHeight;
        }
    </script>
</body>
</html>`;
}

function deactivate() {}

module.exports = {
	activate,
	deactivate
}
