# Pixel Mat

[English](README.md) | [한국어](README.ko.md) | [日本語](README.ja.md)

ゲーム用ピクセルアートの下絵を作るAIスキルと、仕上げ用のWindowsエディターです。
必要なピクセルサイズと色数に変換し、アプリでピクセル・レイヤー・パレットを編集できます。

**Windowsベータ · 0.23.0-beta.2**
[アプリ](https://github.com/hjcud/pixel-mat/releases/download/v0.23.0-beta.2/PixelMat-0.23.0-beta.2-win-x64.zip) ·
[スキル](https://github.com/hjcud/pixel-mat/releases/download/v0.23.0-beta.2/pixel-mat-skill-0.23.0-beta.2.zip) ·
[変更内容・チェックサム](https://github.com/hjcud/pixel-mat/releases/tag/v0.23.0-beta.2)

## 作った理由

16×16のピクセルアートを頼んでも、大きな画像が返ってきたり、ピクセルの境界や色が
揃わなかったりしました。ゲームには実際のピクセルサイズが決まった素材が必要でした。
生成指示、ローカル変換、エディターをつなぎ、PNGとして使った後も編集を続けられるようにしました。

| 生成した16×16色チップボード | 実際の16×16出力を16倍に拡大 |
| --- | --- |
| <img src="docs/whole-style-recovery/accepted-board.png" width="256" alt="256個の色チップを並べた実際の生成画像"> | <img src="docs/whole-style-recovery/accepted-median-display.png" width="256" alt="赤いフードのキャラクターを整数倍率で拡大"> |

透明色を含む16色の固定パレットを使った例です。
[作例ファイルと処理記録](docs/whole-style-recovery/README.md) ·
[別途保存した同一ユーザープロンプトの比較](docs/whole-comparison/README.md)

## クイックスタート

| 目的 | 始め方 | 必要な環境 |
| --- | --- | --- |
| AIホストでスプライトを生成・変換 | [スキルを使う](#スキルを使う) | Node 22以上とスキル対応ホスト。新しい画像の生成には画像生成ツールも必要 |
| 既存のPNGやプロジェクトを編集 | [Windowsアプリを使う](#windowsアプリを使う) | Windows x64。手動編集には別途Nodeの導入やAIアカウントは不要 |

### スキルを使う

以下は **WindowsのCodex CLI/IDE** を使う手順です。ランタイムを含む配布ZIPを
使用してください。ソースのスキルフォルダーだけでは実行に必要なコードが足りません。

1. 上の **スキルZIP** をダウンロードして展開します。
2. `pixel-mat`フォルダー全体を`%USERPROFILE%\.agents\skills\pixel-mat`にコピーします。
   この直下に`SKILL.md`があり、`scripts`、`runtime`、`node_modules`が並ぶ状態にします。
   既存のインストールを置き換える場合は先にバックアップしてください。
3. PowerShellでNodeと配布CLIを確認します。

   ```powershell
   node --version
   node "$env:USERPROFILE\.agents\skills\pixel-mat\scripts\pixel-mat.mjs" help
   ```

   Nodeは22以上が必要です。`Pixel Mat:`で始まるコマンド一覧が出ればCLIは動作しています。
   ホストによるスキルの認識は次の手順で別途確認します。
4. Codexの新しいセッションで`/skills`または`$`を使い、`pixel-mat`を探します。
   表示されない場合はフォルダー構成を確認し、Codexを再起動してください。

スキルを選択し、ホストに画像生成ツールがあることを確認して依頼します。

> $pixel-mat
>
> 透明色を含めて最大16色の16×16ランタンアイコンを作ってください。
> `lantern.png`、`lantern.pixeltool`、8倍の拡大画像`lantern-preview.png`として保存してください。

**最初の結果を確認:** `lantern.png`は **16×16**、拡大画像は **128×128**、
`lantern.pixeltool`はPixel Matで16×16のプロジェクトとして開けることを確認します。
実サイズと拡大の両方で形を確認してください。

画像生成ツールがない場合は、下の[ローカル作例](#ローカル作例を実行)でインストールと
変換を確認できます。他のホストやOSでは、それぞれが対応する配置先と呼び出し方法を
使ってください。[セットアップとトラブル対応](skills/pixel-mat/references/getting-started.md) ·
[Codex公式スキルガイド](https://learn.chatgpt.com/docs/build-skills)

### Windowsアプリを使う

1. 上の **アプリZIP** 全体を展開し、`PixelTool-win32-x64\PixelTool.exe`を実行します。
   実行に必要なファイルも一緒に保持してください。署名なしのベータ版です。
2. GitHubの[作例プロジェクト](docs/whole-style-recovery/accepted-median.pixeltool)で
   **Download raw file**を使って保存し、アプリで開きます。16×16のキャラクターです。
   スキルで作成した`lantern.pixeltool`を開いても構いません。
3. 1ピクセルを編集し、**名前を付けて保存**で`edited.pixeltool`を保存してから
   `edited.png`を書き出します。
4. 編集したタブを閉じてから`edited.pixeltool`を開き直し、編集が残っていることを確認します。
   PNGも16×16のままであることを確認し、比較用に元のプロジェクトを保管してください。

<img src="docs/readme/editor.png" width="800" alt="Miniworldの32×40の家を開いたPixel Mat Windowsエディター、韓国語UI">

画面は別の32×40のMiniworldの家を開いた例です。手動編集とファイル操作はオフラインで
動作し、アプリは7つのUI言語に対応しています。
[インストール・更新](BETA_DISTRIBUTION.md) · [エディターガイド](docs/EDITOR_GUIDE.md)

## 作業別の依頼例

ホストでPixel Matを選び、例にある参照画像やプロジェクトを添付してください。

| 作業 | 依頼例 |
| --- | --- |
| 参照画像から生成 | 「添付キャラクターから、透明色を含む最大16色の16×16スプライトを作ってください。フード・前髪・手とランタンの接点を残し、PNGと編集プロジェクトを渡してください。」 |
| ゲームのパレットを再利用 | 「`house.pixeltool`のパレットを使って`tree-draft.png`を24×40に変換し、`tree.png`と`tree.pixeltool`で保存してください。」 |
| 既存スプライトを修正 | 「`character.pixeltool`のランタンだけを既存パレットで明るくしてください。姿勢と他のピクセルを維持し、適用前に修正案を見せてください。」 |
| 採用した結果をアニメーション化 | 「`character.pixeltool`から1フレーム120msの4フレーム待機モーションを作ってください。既存のピクセル・パーツと1つのパレットを再利用し、先に各フレームを見せてください。プロジェクト・スプライトシート・フレームJSON・APNGを渡してください。」 |

正確な格子・パーツ構成には`from-grid` / `from-parts`、限定的な修正には
`review-context` / `refine`、動作計画には`render-motion`を使います。
すべての作業で先に画像生成が必要なわけではありません。
[スキルガイド](skills/pixel-mat/SKILL.md) · [CLIリファレンス](skills/pixel-mat/references/cli.md)

## 16×16の標準生成フロー

1. **残す特徴の配置を計画。** 顔・体・手・小物を最終的な256マスの中で
   まとめて配置するようAIに指示し、色チップボードを生成します。
2. **格子を検査して代表色を取得。** マスの数と整列を確認し、
   各マスの中央領域からRGBそれぞれの中央値を求めます。
3. **背景を分離。** 外周からつながる灰色の空きマスだけを透明にし、
   対象内部の似た色は残します。
4. **パレットに合わせて保存。** 指定パレットや目標の色数に合わせて、
   PNGと編集可能なプロジェクトを保存します。

16×16の標準は **Whole-chip central median（中央代表色）** です。
**領域割り当て**は同じボードに使えるベータ版の選択肢で、他のサイズには通常の
画像変換を使います。アプリとCLIはこの処理を共有します。AI提案は編集保護の条件を
検証してから適用し、1回の操作で元に戻せます。
[生成フローの詳細](skills/pixel-mat/references/whole-image.md)

## ローカル作例を実行

<details>
<summary>画像生成やAPIキーなしで変換を確認</summary>

[色チップボード](docs/whole-style-recovery/accepted-board.png)と
[パレット](docs/whole-style-recovery/palette.json)を **Download raw file**で保存します。
ファイル名は`accepted-board.png`と`palette.json`のままにし、保存した作業フォルダーで
PowerShellを開きます。上のスキル導入後、次のコマンドを実行してください。

```powershell
$pixelMatCli = "$env:USERPROFILE\.agents\skills\pixel-mat\scripts\pixel-mat.mjs"
node $pixelMatCli whole-prepare --input accepted-board.png --width 16 --height 16 --colors 16 --palette palette.json --output example.pixeltool
node $pixelMatCli preview --input example.pixeltool --scale 1 --output example.png
node $pixelMatCli inspect --input example.pixeltool
```

成功すると`example.pixeltool`と16×16の`example.png`ができ、`inspect`に
`width: 16`と`height: 16`が表示されます。プロジェクトをアプリで開いて編集を続けられます。
通常の画像下絵には`whole-prepare`ではなく`prepare`を使います。
同名の出力が既にある場合は、新しいファイル名を指定してください。

</details>

## AI接続と現在の制限

ローカルエディターとCLIにはAIアカウントは不要です。生成には自分のホストアカウント、
サブスクリプションの利用枠、またはAPIクレジットを使用します。開発者はトークンや
クレジットを提供しません。CLI自体はモデルを呼び出しません。

アプリ内のAI接続は別途設定します。画像全体のAPI生成にはOpenAIを使い、ホストの
サブスクリプションがアプリ内API接続になるわけではありません。Codexの項目はCLIの
状態確認とスキル・ファイルの受け渡しを案内します。[接続とデータ処理](DATA_HANDLING.md)

結果は実サイズで確認してください。格子と色数が正しくても、表情や小物の細部が
十分に残らないことがあります。原画像の解析・再構成・レイアウト・サンプリング平面は
実験機能です。採用したボードとパレットを保管してください。再生成は新しい絵になります。
[手法と検証記録](docs/TECHNIQUES.md)

## 開発と貢献

ソースからの実行にはWindows、Node **22.12以上**、pnpmが必要です。

```sh
pnpm install --frozen-lockfile
pnpm start
pnpm test
pnpm build:skill
```

[貢献ガイド](CONTRIBUTING.md)にデスクトップ・配布物の検証方法を記載しています。
自動化したモデル検証ではモックを使用します。
[Issue](https://github.com/hjcud/pixel-mat/issues)は英語でお願いします。

コードとスキル指示は[MITライセンス](LICENSE)です。参照画像とゲーム素材の権利は
[ライセンスの範囲](LICENSE_SCOPE.md)で区別しています。
[セキュリティ](SECURITY.md) · [外部コンポーネント](THIRD_PARTY_NOTICES.md) ·
[翻訳の出典](TRANSLATION_PROVENANCE_REVIEW.md)
