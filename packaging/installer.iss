; Inno Setup — PlantUMLAssist のインストーラ (BLK-human-20260909-2200)
;
;   iscc packaging\installer.iss
;
; PyInstaller が dist\PlantUMLAssist\ に出したものをそのまま包む。
; plantuml.jar と Java は含まない (アプリの設定画面から入れる)。
#define AppName "PlantUMLAssist"
#ifndef AppVersion
  #define AppVersion "1.0.0"
#endif

[Setup]
; BLK-human-20260917-0900: 上書き更新にする。
; AppId は既定で AppName ("PlantUMLAssist") になっており、v2.10 までの全版が
; HKCU\...\Uninstall\PlantUMLAssist_is1 に登録している。ここで GUID に替えると旧版と
; 別物扱いになり二重登録を自分で作るので、既定と同じ値を明示して固定する (以後変えない)。
AppId=PlantUMLAssist
AppName={#AppName}
AppVersion={#AppVersion}
AppVerName={#AppName} {#AppVersion}
VersionInfoVersion={#AppVersion}
VersionInfoProductVersion={#AppVersion}
UninstallDisplayName={#AppName}
; 前回と同じ場所・同じ権限で入れる (更新時はフォルダ選択を出さない)
UsePreviousAppDir=yes
UsePreviousGroup=yes
UsePreviousPrivileges=yes
DisableDirPage=auto
DisableProgramGroupPage=auto
; 起動中の exe を閉じてから置き換える
CloseApplications=yes
RestartApplications=no
AppPublisher=PlantUMLAssist
DefaultDirName={autopf}\{#AppName}
DefaultGroupName={#AppName}
UninstallDisplayIcon={app}\{#AppName}.exe
; アイコンは packaging/icon.ico が正本 (BLK-human-20260915-1202)
SetupIconFile=icon.ico
OutputDir=..\dist
OutputBaseFilename={#AppName}-{#AppVersion}-setup
Compression=lzma2
SolidCompression=yes
ArchitecturesInstallIn64BitMode=x64compatible
PrivilegesRequired=lowest
; 以前は dialog で「全ユーザー / 自分だけ」を毎回選ばせており、選び方が変わると
; Program Files (HKLM) と AppData (HKCU) に 2 件入った。既定は常に自分だけ。
; 全ユーザー向けはコマンドライン /ALLUSERS でだけ選べる。
PrivilegesRequiredOverridesAllowed=commandline

[Languages]
Name: "ja"; MessagesFile: "compiler:Languages\Japanese.isl"
Name: "en"; MessagesFile: "compiler:Default.isl"

[InstallDelete]
; 旧版の _internal を消してから入れる (消えたファイルが残って古い版が混ざらない)。
; 設定 (%LOCALAPPDATA%\PlantUMLAssist) と plantuml.jar の場所はアプリ外なので引き継がれる。
Type: filesandordirs; Name: "{app}\_internal"

[Files]
Source: "..\dist\{#AppName}\*"; DestDir: "{app}"; Flags: recursesubdirs createallsubdirs ignoreversion

[Icons]
Name: "{group}\{#AppName}"; Filename: "{app}\{#AppName}.exe"; IconFilename: "{app}\packaging\icon.ico"
Name: "{autodesktop}\{#AppName}"; Filename: "{app}\{#AppName}.exe"; IconFilename: "{app}\packaging\icon.ico"; Tasks: desktopicon

[Tasks]
Name: "desktopicon"; Description: "{cm:CreateDesktopIcon}"; GroupDescription: "{cm:AdditionalIcons}"; Flags: unchecked

[Run]
Filename: "{app}\{#AppName}.exe"; Description: "{cm:LaunchProgram,{#AppName}}"; Flags: nowait postinstall skipifsilent

[Code]
// BLK-human-20260917-0900: 既に二重に入ってしまった PC の片付け。
// 今の登録と反対側 (自分だけ ⇔ 全ユーザー) に PlantUMLAssist_is1 が残っていれば、
// その uninstaller を確認付きで走らせる。サイレント時は聞かずにログだけ残す。
const
  UninstKey = 'Software\Microsoft\Windows\CurrentVersion\Uninstall\PlantUMLAssist_is1';

function FindOther(var Cmd: String; var Loc: String): Boolean;
var
  Root: Integer;
begin
  if IsAdminInstallMode then Root := HKCU else Root := HKLM64;
  Result := RegQueryStringValue(Root, UninstKey, 'UninstallString', Cmd);
  if (not Result) and (not IsAdminInstallMode) then begin
    Root := HKLM32;
    Result := RegQueryStringValue(Root, UninstKey, 'UninstallString', Cmd);
  end;
  if Result then begin
    if not RegQueryStringValue(Root, UninstKey, 'InstallLocation', Loc) then Loc := '';
    Cmd := RemoveQuotes(Cmd);
  end;
end;

procedure CleanupOtherInstall();
var
  Cmd, Loc, Verb: String;
  Code: Integer;
begin
  if not FindOther(Cmd, Loc) then exit;
  Log('Found duplicate PlantUMLAssist registration: ' + Cmd);
  if WizardSilent then begin
    Log('Silent mode: left as is. Remove it from Settings > Apps (PlantUMLAssist, ' + Loc + ').');
    exit;
  end;
  if MsgBox('別の場所に古い PlantUMLAssist が残っています:' + #13#10 + Loc + #13#10#13#10 +
            '二重に入った古い方をアンインストールしますか? (設定と plantuml.jar はそのまま残ります)' + #13#10 +
            '「いいえ」の場合は、後で Windows の「設定 → アプリ」から古い方を削除できます。',
            mbConfirmation, MB_YESNO) <> IDYES then exit;
  if IsAdminInstallMode then Verb := 'open' else Verb := 'runas';
  if not ShellExec(Verb, Cmd, '/SILENT /NORESTART /SUPPRESSMSGBOXES', '', SW_SHOW, ewWaitUntilTerminated, Code) then
    MsgBox('古い方を片付けられませんでした。「設定 → アプリ」から PlantUMLAssist (' + Loc + ') を削除してください。', mbInformation, MB_OK);
end;

procedure CurStepChanged(CurStep: TSetupStep);
begin
  if CurStep = ssPostInstall then CleanupOtherInstall();
end;
