import * as vscode from "vscode";
import { PreviewPanel } from "./previewPanel";

export function activate(context: vscode.ExtensionContext) {
  const command = vscode.commands.registerCommand(
    "scadPreview.open",
    () => {
      const editor = vscode.window.activeTextEditor;
      if (!editor || !editor.document.fileName.endsWith(".scad")) {
        vscode.window.showWarningMessage(
          "Open a .scad file first to preview it."
        );
        return;
      }
      PreviewPanel.createOrShow(context, editor.document);
    }
  );

  const onSave = vscode.workspace.onDidSaveTextDocument((doc) => {
    if (doc.fileName.endsWith(".scad")) {
      PreviewPanel.update(doc);
    }
  });

  context.subscriptions.push(command, onSave);
}

export function deactivate() {}
