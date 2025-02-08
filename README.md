# FileDep

VSCode用の依存関係可視化拡張機能です。プロジェクト内のファイル間の依存関係を視覚的に表示し、効率的なコード理解をサポートします。

## 処理フロー

1. 初期化フロー
   ```
   extension.ts (activate)
   ├── DependencyGraphProvider作成
   └── DependencyGraphView作成
   ```

2. 依存関係解析フロー
   ```
   DependencyGraphProvider.updateDependencies
   ├── FileCollector.collectAllFiles
   │   └── ファイルの収集（拡張子フィルタリング）
   ├── DependencyAnalyzer.analyzeDependencies
   │   ├── 各ファイルの依存関係を解析
   │   │   ├── JS/TSファイル: import/require/JSX解析
   │   │   ├── CSSファイル: @import/url解析
   │   │   └── HTMLファイル: link/script/img解析
   │   └── PathResolver.resolveDependencyPaths
   │       └── 相対パスを絶対パスに解決
   └── 双方向の依存関係を構築
   ```

3. グラフ表示フロー
   ```
   DependencyGraphView.show
   ├── WebViewパネル作成
   ├── 依存関係データの取得
   │   ├── DependencyGraphProvider.getDependencies
   │   └── フィルタリング（拡張子/ディレクトリ）
   ├── グラフデータの変換
   └── WebViewでのグラフ描画
       ├── D3.jsでグラフを描画
       ├── イベントハンドラ設定
       └── フィルターUI表示
   ```

4. フィルタリングフロー
   ```
   WebView UI操作
   ├── 拡張子フィルター
   │   ├── DependencyGraphProvider.setExtensionEnabled
   │   └── 依存関係の再解析と再描画
   └── ディレクトリフィルター
       ├── DependencyGraphProvider.setDirectoryEnabled
       └── グラフの再描画
   ```

## 機能

- ファイル間の依存関係を可視化
- 拡張子ごとのフィルタリング
- ディレクトリごとのフィルタリング
- インタラクティブなグラフ表示
- ズーム・パン機能
- ノードのドラッグ＆ドロップ

## ファイル構成

### コア機能

- `src/extension.ts`
  - 拡張機能のエントリーポイント
  - コマンドの登録と初期化処理を担当

- `src/dependencyGraphProvider.ts`
  - 依存関係の管理と解析の中心的なクラス
  - ファイル間の依存関係の保持と更新
  - フィルタリング機能の提供

- `src/dependencyGraphView.ts`
  - WebViewの管理とグラフ表示の制御
  - VSCodeとWebView間の通信を担当

### ユーティリティ

- `src/utils/dependencyAnalyzer.ts`
  - ファイル内の依存関係を解析
  - import/require文の検出
  - React/JSXの依存関係解析
  - CSSの依存関係解析

- `src/utils/fileCollector.ts`
  - プロジェクト内のファイル収集
  - 対象ファイルのフィルタリング

- `src/utils/pathResolver.ts`
  - パスの解決と正規化
  - 相対パスから絶対パスへの変換

### WebView関連

- `src/webview/dependencyGraph.html`
  - WebViewのHTMLテンプレート
  - D3.jsとVis.jsの読み込み

- `src/webview/script.ts`
  - グラフの描画とインタラクション処理
  - D3.jsを使用したグラフの制御
  - フィルターUIの実装

- `src/webview/style.css`
  - グラフとUIのスタイル定義
  - VSCodeのテーマに合わせたデザイン

- `src/webview/types.d.ts`
  - TypeScript型定義
  - D3.jsとVis.jsの型拡張

## 使用方法

1. コマンドパレットを開く（Ctrl+Shift+P）
2. "FileDep: 依存関係を表示" を選択
3. グラフが表示され、以下の操作が可能：
   - ノードのドラッグ＆ドロップ
   - ズーム（Shiftキー + マウスホイール）
   - パン（ドラッグ）
   - 拡張子フィルター
   - ディレクトリフィルター

## 設定

`settings.json`で以下の設定が可能：

- `filedep.ignoredExtensions`: 解析から除外する拡張子
- `filedep.ignoredDirectories`: 解析から除外するディレクトリ
- `filedep.visibleDirectories`: フィルターに表示するディレクトリ
- `filedep.checkBinaryFiles`: バイナリファイルの自動検出

## 開発

```bash
# 依存関係のインストール
npm install

# 開発用ビルド
npm run watch

# パッケージング
npm run package
```
