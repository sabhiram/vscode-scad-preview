import * as vscode from "vscode";
import * as path from "path";
import * as fs from "fs";

export class PreviewPanel {
  private static instance: PreviewPanel | undefined;
  private readonly panel: vscode.WebviewPanel;
  private readonly extensionUri: vscode.Uri;
  private currentFileName: string | undefined;
  private disposables: vscode.Disposable[] = [];

  private constructor(
    context: vscode.ExtensionContext,
    panel: vscode.WebviewPanel,
    document: vscode.TextDocument
  ) {
    this.panel = panel;
    this.extensionUri = context.extensionUri;
    this.currentFileName = document.fileName;

    this.panel.webview.html = this.getHtmlForWebview();

    this.panel.webview.onDidReceiveMessage(
      async (msg) => {
        switch (msg.type) {
          case "requestFile": {
            const requestedPath = this.resolveIncludePath(msg.path);
            try {
              const contents = fs.readFileSync(requestedPath, "utf-8");
              this.panel.webview.postMessage({
                type: "fileContents",
                path: msg.path,
                contents,
              });
            } catch {
              this.panel.webview.postMessage({
                type: "fileContents",
                path: msg.path,
                contents: null,
              });
            }
            break;
          }
          case "status": {
            if (msg.state === "error" && msg.error) {
              vscode.window.showErrorMessage(
                `SCAD: ${msg.error}`
              );
            }
            break;
          }
          case "ready": {
            // Webview is ready, send initial source
            if (this.currentFileName) {
              try {
                const source = fs.readFileSync(this.currentFileName, "utf-8");
                this.sendUpdate(source, this.currentFileName);
              } catch {
                // file may not exist
              }
            }
            break;
          }
        }
      },
      null,
      this.disposables
    );

    this.panel.onDidDispose(() => this.dispose(), null, this.disposables);

    // Send initial content
    const source = document.getText();
    // Small delay to let webview initialize
    setTimeout(() => this.sendUpdate(source, document.fileName), 200);
  }

  private resolveIncludePath(includePath: string): string {
    if (path.isAbsolute(includePath)) {
      return includePath;
    }
    const dir = this.currentFileName
      ? path.dirname(this.currentFileName)
      : "";
    return path.resolve(dir, includePath);
  }

  private sendUpdate(source: string, fileName: string) {
    this.panel.webview.postMessage({
      type: "update",
      source,
      fileName,
    });
  }

  static createOrShow(
    context: vscode.ExtensionContext,
    document: vscode.TextDocument
  ) {
    if (PreviewPanel.instance) {
      PreviewPanel.instance.currentFileName = document.fileName;
      PreviewPanel.instance.panel.reveal(vscode.ViewColumn.Beside);
      const source = document.getText();
      PreviewPanel.instance.sendUpdate(source, document.fileName);
      return;
    }

    const panel = vscode.window.createWebviewPanel(
      "scadPreview",
      "SCAD Preview",
      vscode.ViewColumn.Beside,
      {
        enableScripts: true,
        retainContextWhenHidden: true,
        localResourceRoots: [
          vscode.Uri.joinPath(context.extensionUri, "dist"),
        ],
      }
    );

    PreviewPanel.instance = new PreviewPanel(context, panel, document);
  }

  static update(document: vscode.TextDocument) {
    if (!PreviewPanel.instance) {
      return;
    }
    PreviewPanel.instance.currentFileName = document.fileName;
    PreviewPanel.instance.sendUpdate(document.getText(), document.fileName);
  }

  private getHtmlForWebview(): string {
    const webview = this.panel.webview;
    const distUri = vscode.Uri.joinPath(this.extensionUri, "dist");

    const webviewJs = webview.asWebviewUri(
      vscode.Uri.joinPath(distUri, "webview.js")
    );
    const workerJs = webview.asWebviewUri(
      vscode.Uri.joinPath(distUri, "scad-worker.js")
    );

    const nonce = getNonce();

    return /* html */ `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta http-equiv="Content-Security-Policy" content="
    default-src 'none';
    script-src 'nonce-${nonce}' 'wasm-unsafe-eval' ${webview.cspSource};
    style-src 'unsafe-inline' ${webview.cspSource};
    img-src ${webview.cspSource} blob: data:;
    connect-src ${webview.cspSource} blob: data:;
    worker-src ${webview.cspSource} blob:;
    font-src ${webview.cspSource};
  ">
  <title>SCAD Preview</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    html, body { width: 100%; height: 100%; overflow: hidden; background: #1e1e1e; color: #ccc; font-family: -apple-system, BlinkMacSystemFont, sans-serif; }
    #viewer { width: 100%; height: calc(100% - 32px); display: block; }
    #toolbar { height: 32px; display: flex; align-items: center; justify-content: space-between; padding: 0 10px; font-size: 12px; background: #252526; border-top: 1px solid #333; }
    #status { flex: 1; }
    #status.error { color: #f44747; }
    #status.compiling { color: #dcdcaa; }
    #status.done { color: #608b4e; }
    #download-stl { display: none; padding: 2px 10px; font-size: 12px; background: #0e639c; color: #fff; border: none; border-radius: 3px; cursor: pointer; }
    #download-stl:hover { background: #1177bb; }
  </style>
</head>
<body>
  <canvas id="viewer"></canvas>
  <div id="toolbar">
    <span id="status">Ready — open a .scad file</span>
    <button id="download-stl">Download STL</button>
  </div>
  <script nonce="${nonce}">
    window.__workerUri = "${workerJs}";
  </script>
  <script nonce="${nonce}" type="module" src="${webviewJs}"></script>
</body>
</html>`;
  }

  private dispose() {
    PreviewPanel.instance = undefined;
    this.panel.dispose();
    for (const d of this.disposables) {
      d.dispose();
    }
    this.disposables = [];
  }
}

function getNonce(): string {
  let text = "";
  const chars =
    "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
  for (let i = 0; i < 32; i++) {
    text += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return text;
}
