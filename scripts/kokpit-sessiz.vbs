' Kokpit'i konsol penceresi ACMADAN baslatir. Baslat menusu kisayolu bunu hedefler.
' node bir konsol uygulamasi: dogrudan .lnk hedefi yapilsaydi Electron'un yaninda
' bos bir siyah pencere kalirdi. WScript.Shell.Run'in 0'i pencereyi gizler.
' Ciktilar gorunmez; teshis icin ~/.kokpit/kokpit.log veya terminalden `kokpit`.
Set kabuk = CreateObject("WScript.Shell")
Set fso = CreateObject("Scripting.FileSystemObject")
kok = fso.GetParentFolderName(fso.GetParentFolderName(WScript.ScriptFullName))
kabuk.CurrentDirectory = kok
' Argumanlar aynen gecer: Windows acilis kaydi `--arka` verir (pencere gizli, Ada + tepsi).
argumanlar = ""
For Each a In WScript.Arguments
  argumanlar = argumanlar & " " & a
Next
kabuk.Run "node """ & kok & "\scripts\uretim.cjs""" & argumanlar, 0, False
