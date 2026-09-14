#Requires AutoHotkey v2.0+
#SingleInstance Force
Persistent

; V21 Pro AHK Companion v7
; - Serves the Studio at http://127.0.0.1:32145/
; - Reports the active Windows app/title to the Studio.
; - Counts F13-F24 and the Studio-defined Layer 1 triggers without blocking them.
; - Receives the Layer 1 layout from Studio and persists it locally.
; - Supplies recent input events as a fallback when the browser reserves a shortcut.
; - Stores aggregate usage in v21-companion-usage.ini beside this script.
; - Persists every tracked Layer 1 / Layer 2 input to v21-companion-history.jsonl.
; - Keeps historical Layer 1 triggers even after the Studio layout changes.

class V21CompanionApp {
    __New(port := 32145) {
        this.Version := "7.0.1"
        this.Port := port
        this.StartedAt := IsoNow()
        this.DataFile := A_ScriptDir "\v21-companion-usage.ini"
        this.HtmlFile := A_ScriptDir "\v21-pro-shortcut-studio-v25.html"
        this.LayoutFile := A_ScriptDir "\v21-companion-layout.txt"
        this.L2LayoutFile := A_ScriptDir "\v21-companion-l2-layout.txt"
        this.StudioStateFile := A_ScriptDir "\v21-studio-state.json"
        this.KnownTriggerFile := A_ScriptDir "\v21-companion-known-triggers.txt"
        this.HistoryFile := A_ScriptDir "\v21-companion-history.jsonl"
        this.Active := Map("exe", "", "title", "", "class", "", "pid", 0, "changedAt", this.StartedAt)
        this.Usage := Map()
        this.Held := Map()
        this.ShortcutUsage := Map()
        this.L1Held := Map()
        this.RegisteredL1Hotkeys := []
        this.RegisteredL2Hotkeys := []
        this.Recent := []
        this.EventCounter := 0
        this.HistoryCount := this.CountHistoryLines()
        this.StudioLayer := ""
        this.SiteRuntimeJson := "{}"
        this.LayoutEntries := this.LoadLayoutEntries()
        this.L1Triggers := this.TriggersFromEntries(this.LayoutEntries)
        this.KnownL1Triggers := this.LoadKnownTriggers()
        for trigger in this.L1Triggers
            this.RememberKnownTrigger(trigger, false)
        this.SaveKnownTriggers()
        this.L2Entries := this.LoadL2Entries()
        this.L2Triggers := this.TriggersFromL2Entries(this.L2Entries)
        this.LoadUsage()
        this.RegisterL1Hotkeys()
        this.RegisterL2Hotkeys()

        this.Server := V21HttpServer(this, port)
        SetTimer(ObjBindMethod(this, "UpdateActiveWindow"), 250)
        SetTimer(ObjBindMethod(this, "SaveUsage"), 5000)
        OnExit(ObjBindMethod(this, "Shutdown"))

        this.ConfigureTray()
        this.UpdateActiveWindow()
        TrayTip("V21 Companion", "Listening on 127.0.0.1:" port "`nUse the tray menu to open Studio.")
    }

    ConfigureTray() {
        A_TrayMenu.Delete()
        A_TrayMenu.Add("Open Studio", (*) => Run("http://127.0.0.1:" this.Port "/"))
        A_TrayMenu.Add("Open Compact View", (*) => Run("http://127.0.0.1:" this.Port "/?compact=1"))
        A_TrayMenu.Add("Open companion folder", (*) => Run(A_ScriptDir))
        A_TrayMenu.Add()
        A_TrayMenu.Add("Reset counters (history kept)", (*) => this.ResetUsage())
        A_TrayMenu.Add("Open history file", (*) => this.OpenHistory())
        A_TrayMenu.Add("Open Studio data file", (*) => this.OpenStudioState())
        A_TrayMenu.Add("Reload Layer 1 layout", (*) => this.ReloadLayout())
        A_TrayMenu.Add("Reload Layer 2 layout", (*) => this.ReloadL2Layout())
        A_TrayMenu.Add("Reload companion", (*) => Reload())
        A_TrayMenu.Add()
        A_TrayMenu.Add("Exit", (*) => ExitApp())
    }

    LoadUsage() {
        Loop 12 {
            signal := "F" (12 + A_Index)
            count := 0
            lastUsed := ""
            try count := IniRead(this.DataFile, "Usage", signal "_Count", 0) + 0
            try lastUsed := IniRead(this.DataFile, "Usage", signal "_Last", "")
            this.Usage[signal] := Map("count", count, "lastUsed", lastUsed)
            this.Held[signal] := false
        }


        for trigger in this.KnownL1Triggers
            this.EnsureShortcutUsage(trigger)
        for signal in this.L2Triggers
            this.EnsureL2Usage(signal)
    }

    DefaultL1Triggers() {
        keys := ["A", "B", "C", "D", "7", "8", "9", "E", "4", "5", "6", "1", "2", "3", "F"]
        banks := ["Alt", "Alt+Shift", "Ctrl+Alt", "Ctrl+Alt+Shift"]
        out := []
        for bank in banks {
            for key in keys
                out.Push(bank "+" key)
        }
        return out
    }

    LoadLayoutEntries() {
        entries := []
        if FileExist(this.LayoutFile) {
            try {
                for line in StrSplit(FileRead(this.LayoutFile, "UTF-8"), "`n", "`r") {
                    text := Trim(line)
                    if text = ""
                        continue
                    parts := StrSplit(text, "`t")
                    if parts.Length >= 3 {
                        bank := Trim(parts[1])
                        keyId := Trim(parts[2])
                        trigger := Trim(parts[3])
                        if trigger != ""
                            entries.Push(Map("bank", bank, "keyId", keyId, "trigger", trigger))
                    } else {
                        trigger := text
                        if trigger != ""
                            entries.Push(Map("bank", "", "keyId", "", "trigger", trigger))
                    }
                }
            }
        }
        if entries.Length
            return entries

        defaults := []
        keys := ["numlock","divide","multiply","subtract","7","8","9","add","4","5","6","1","2","3","enter"]
        labels := ["A","B","C","D","7","8","9","E","4","5","6","1","2","3","F"]
        banks := ["alt","altShift","ctrlAlt","ctrlAltShift"]
        bankText := ["Alt","Alt+Shift","Ctrl+Alt","Ctrl+Alt+Shift"]
        for bankIndex, bank in banks {
            for keyIndex, keyId in keys
                defaults.Push(Map("bank", bank, "keyId", keyId, "trigger", bankText[bankIndex] "+" labels[keyIndex]))
        }
        return defaults
    }

    TriggersFromEntries(entries) {
        triggers := []
        for entry in entries {
            trigger := entry["trigger"]
            if trigger != "" && !ArrayHasValue(triggers, trigger)
                triggers.Push(trigger)
        }
        return triggers
    }

    SaveLayout() {
        lines := []
        for entry in this.LayoutEntries {
            if entry["bank"] != "" || entry["keyId"] != ""
                lines.Push(entry["bank"] "`t" entry["keyId"] "`t" entry["trigger"])
            else
                lines.Push(entry["trigger"])
        }
        text := Join(lines, "`r`n")
        try FileDelete(this.LayoutFile)
        FileAppend(text, this.LayoutFile, "UTF-8")
    }

    LoadKnownTriggers() {
        items := []
        if FileExist(this.KnownTriggerFile) {
            try {
                for line in StrSplit(FileRead(this.KnownTriggerFile, "UTF-8"), "`n", "`r") {
                    trigger := Trim(line)
                    if trigger != "" && !ArrayHasValue(items, trigger)
                        items.Push(trigger)
                }
            }
        }
        return items
    }

    SaveKnownTriggers() {
        text := Join(this.KnownL1Triggers, "`r`n")
        try FileDelete(this.KnownTriggerFile)
        FileAppend(text, this.KnownTriggerFile, "UTF-8")
    }

    RememberKnownTrigger(trigger, save := true) {
        if trigger = "" || ArrayHasValue(this.KnownL1Triggers, trigger)
            return
        this.KnownL1Triggers.Push(trigger)
        if save
            this.SaveKnownTriggers()
    }

    SlotForTrigger(trigger) {
        for entry in this.LayoutEntries {
            if entry["trigger"] = trigger {
                if entry["bank"] != "" || entry["keyId"] != ""
                    return entry["bank"] "/" entry["keyId"]
                return ""
            }
        }
        return ""
    }

    CountHistoryLines() {
        if !FileExist(this.HistoryFile)
            return 0
        count := 0
        try {
            for line in StrSplit(FileRead(this.HistoryFile, "UTF-8"), "`n", "`r") {
                if Trim(line) != ""
                    count += 1
            }
        }
        return count
    }

    AppendHistory(kind, signal, now, slot := "", extra := "") {
        line := "{" Q("id") ":" this.EventCounter "," Q("kind") ":" Q(kind) "," Q("signal") ":" Q(signal) "," Q("slot") ":" Q(slot) "," Q("time") ":" Q(now) "," Q("exe") ":" Q(this.Active["exe"]) "," Q("title") ":" Q(this.Active["title"]) "," Q("extra") ":" Q(extra) "}`n"
        try FileAppend(line, this.HistoryFile, "UTF-8")
        this.HistoryCount += 1
    }

    OpenHistory(*) {
        if !FileExist(this.HistoryFile)
            FileAppend("", this.HistoryFile, "UTF-8")
        Run("notepad.exe `"" this.HistoryFile "`"")
    }

    EnsureShortcutUsage(trigger) {
        if this.ShortcutUsage.Has(trigger)
            return
        iniKey := SafeIniKey(trigger)
        count := 0
        lastUsed := ""
        try count := IniRead(this.DataFile, "ShortcutUsage", iniKey "_Count", 0) + 0
        try lastUsed := IniRead(this.DataFile, "ShortcutUsage", iniKey "_Last", "")
        this.ShortcutUsage[trigger] := Map("count", count, "lastUsed", lastUsed)
        this.L1Held[trigger] := false
    }


    DefaultL2Entries() {
        return [
            Map("keyId","1","signal","F13"), Map("keyId","2","signal","F14"), Map("keyId","3","signal","F15"),
            Map("keyId","4","signal","F16"), Map("keyId","5","signal","F17"), Map("keyId","6","signal","F18"),
            Map("keyId","7","signal","F19"), Map("keyId","8","signal","F20"), Map("keyId","9","signal","F21"),
            Map("keyId","numlock","signal","F22"), Map("keyId","divide","signal","F23"), Map("keyId","multiply","signal","F24")
        ]
    }

    LoadL2Entries() {
        entries := []
        if FileExist(this.L2LayoutFile) {
            try {
                for line in StrSplit(FileRead(this.L2LayoutFile, "UTF-8"), "`n", "`r") {
                    text := RTrim(line, "`r`n")
                    if text = ""
                        continue
                    parts := StrSplit(text, "`t")
                    if parts.Length >= 2 {
                        keyId := Trim(parts[1])
                        signal := Trim(parts[2])
                        if signal != ""
                            entries.Push(Map("keyId", keyId, "signal", signal))
                    }
                }
            }
        }
        return entries.Length ? entries : this.DefaultL2Entries()
    }

    TriggersFromL2Entries(entries) {
        triggers := []
        for entry in entries {
            signal := entry["signal"]
            if signal != "" && !ArrayHasValue(triggers, signal)
                triggers.Push(signal)
        }
        return triggers
    }

    SaveL2Layout() {
        lines := []
        for entry in this.L2Entries
            lines.Push(entry["keyId"] "`t" entry["signal"])
        try FileDelete(this.L2LayoutFile)
        FileAppend(Join(lines, "`r`n"), this.L2LayoutFile, "UTF-8")
    }

    EnsureL2Usage(signal) {
        if this.Usage.Has(signal)
            return
        count := 0
        lastUsed := ""
        try count := IniRead(this.DataFile, "Usage", signal "_Count", 0) + 0
        try lastUsed := IniRead(this.DataFile, "Usage", signal "_Last", "")
        this.Usage[signal] := Map("count", count, "lastUsed", lastUsed)
        this.Held[signal] := false
    }

    UnregisterL2Hotkeys() {
        for hotkeyName in this.RegisteredL2Hotkeys {
            try Hotkey(hotkeyName, "Off")
        }
        this.RegisteredL2Hotkeys := []
        this.Held.Clear()
    }

    RegisterL2Hotkeys() {
        this.UnregisterL2Hotkeys()
        for signal in this.L2Triggers {
            this.EnsureL2Usage(signal)
            keyName := HumanTriggerToHotkey(signal)
            if keyName = ""
                continue
            downName := "~" keyName
            upName := "~" keyName " Up"
            try {
                Hotkey(downName, ObjBindMethod(this, "TrackDown", signal), "On")
                Hotkey(upName, ObjBindMethod(this, "TrackUp", signal), "On")
                this.RegisteredL2Hotkeys.Push(downName)
                this.RegisteredL2Hotkeys.Push(upName)
            }
        }
    }

    ApplyL2Layout(body) {
        entries := []
        for line in StrSplit(body, "`n", "`r") {
            text := RTrim(line, "`r`n")
            if text = ""
                continue
            parts := StrSplit(text, "`t")
            if parts.Length < 2
                continue
            keyId := Trim(parts[1])
            signal := Trim(parts[2])
            if signal = ""
                continue
            if HumanTriggerToHotkey(signal) = ""
                throw Error("Unsupported Layer 2 signal: " signal)
            entries.Push(Map("keyId", keyId, "signal", signal))
        }
        if !entries.Length
            throw Error("Layer 2 layout is empty")

        oldBySlot := Map()
        for entry in this.L2Entries
            oldBySlot[entry["keyId"]] := entry["signal"]

        this.L2Entries := entries
        this.L2Triggers := this.TriggersFromL2Entries(entries)
        for entry in entries {
            signal := entry["signal"]
            this.EnsureL2Usage(signal)
            keyId := entry["keyId"]
            if oldBySlot.Has(keyId) && oldBySlot[keyId] != signal {
                this.EventCounter += 1
                this.AppendHistory("l2-layout", signal, IsoNow(), keyId, oldBySlot[keyId] " -> " signal)
            }
        }
        this.SaveL2Layout()
        this.RegisterL2Hotkeys()
        return entries.Length
    }

    ReloadL2Layout(*) {
        this.L2Entries := this.LoadL2Entries()
        this.L2Triggers := this.TriggersFromL2Entries(this.L2Entries)
        for signal in this.L2Triggers
            this.EnsureL2Usage(signal)
        this.RegisterL2Hotkeys()
        TrayTip("V21 Companion", this.L2Triggers.Length " Layer 2 signals loaded.")
    }

    OpenStudioState(*) {
        if !FileExist(this.StudioStateFile)
            FileAppend("{}", this.StudioStateFile, "UTF-8")
        Run("notepad.exe `"" this.StudioStateFile "`"")
    }

    UnregisterL1Hotkeys() {
        for hotkeyName in this.RegisteredL1Hotkeys {
            try Hotkey(hotkeyName, "Off")
        }
        this.RegisteredL1Hotkeys := []
        this.L1Held.Clear()
    }

    RegisterL1Hotkeys() {
        this.UnregisterL1Hotkeys()
        for trigger in this.L1Triggers {
            this.EnsureShortcutUsage(trigger)
            keyName := HumanTriggerToHotkey(trigger)
            if keyName = ""
                continue
            downName := "~" keyName
            upName := "~" keyName " Up"
            try {
                Hotkey(downName, ObjBindMethod(this, "TrackShortcutDown", trigger), "On")
                Hotkey(upName, ObjBindMethod(this, "TrackShortcutUp", trigger), "On")
                this.RegisteredL1Hotkeys.Push(downName)
                this.RegisteredL1Hotkeys.Push(upName)
            }
        }
    }

    ApplyLayout(body) {
        entries := []
        for line in StrSplit(body, "`n", "`r") {
            text := Trim(line)
            if text = ""
                continue
            parts := StrSplit(text, "`t")
            bank := ""
            keyId := ""
            trigger := text
            if parts.Length >= 3 {
                bank := Trim(parts[1])
                keyId := Trim(parts[2])
                trigger := Trim(parts[3])
            }
            if HumanTriggerToHotkey(trigger) = ""
                throw Error("Unsupported trigger: " trigger)
            entries.Push(Map("bank", bank, "keyId", keyId, "trigger", trigger))
        }
        if !entries.Length
            throw Error("Layout is empty")

        oldBySlot := Map()
        for entry in this.LayoutEntries {
            slot := entry["bank"] "/" entry["keyId"]
            if slot != "/"
                oldBySlot[slot] := entry["trigger"]
        }

        this.LayoutEntries := entries
        this.L1Triggers := this.TriggersFromEntries(entries)
        for entry in entries {
            trigger := entry["trigger"]
            this.RememberKnownTrigger(trigger, false)
            this.EnsureShortcutUsage(trigger)
            slot := entry["bank"] "/" entry["keyId"]
            if slot != "/" && oldBySlot.Has(slot) && oldBySlot[slot] != trigger {
                this.EventCounter += 1
                now := IsoNow()
                this.AppendHistory("layout", trigger, now, slot, oldBySlot[slot] " -> " trigger)
            }
        }
        this.SaveKnownTriggers()
        this.SaveLayout()
        this.RegisterL1Hotkeys()
        return entries.Length
    }

    ReloadLayout(*) {
        this.LayoutEntries := this.LoadLayoutEntries()
        this.L1Triggers := this.TriggersFromEntries(this.LayoutEntries)
        for trigger in this.L1Triggers {
            this.RememberKnownTrigger(trigger, false)
            this.EnsureShortcutUsage(trigger)
        }
        this.SaveKnownTriggers()
        this.RegisterL1Hotkeys()
        TrayTip("V21 Companion", this.L1Triggers.Length " Layer 1 triggers loaded.")
    }

    SaveUsage(*) {
        try {
            for signal, data in this.Usage {
                IniWrite(data["count"], this.DataFile, "Usage", signal "_Count")
                IniWrite(data["lastUsed"], this.DataFile, "Usage", signal "_Last")
            }
            for trigger, data in this.ShortcutUsage {
                iniKey := SafeIniKey(trigger)
                IniWrite(data["count"], this.DataFile, "ShortcutUsage", iniKey "_Count")
                IniWrite(data["lastUsed"], this.DataFile, "ShortcutUsage", iniKey "_Last")
            }
        }
    }

    ResetUsage(*) {
        for signal, data in this.Usage {
            data["count"] := 0
            data["lastUsed"] := ""
        }
        for trigger, data in this.ShortcutUsage {
            data["count"] := 0
            data["lastUsed"] := ""
        }
        this.Recent := []
        this.SaveUsage()
        TrayTip("V21 Companion", "Usage was reset.")
    }

    TrackDown(signal, *) {
        if this.StudioLayer != "2"
            return
        this.EnsureL2Usage(signal)
        if this.Held.Get(signal, false)
            return

        this.Held[signal] := true
        now := IsoNow()
        data := this.Usage[signal]
        data["count"] += 1
        data["lastUsed"] := now

        this.EventCounter += 1
        event := Map(
            "id", this.EventCounter,
            "kind", "l2",
            "signal", signal,
            "slot", "",
            "time", now,
            "exe", this.Active["exe"],
            "title", this.Active["title"]
        )
        this.Recent.InsertAt(1, event)
        this.AppendHistory("l2", signal, now)
        while this.Recent.Length > 24
            this.Recent.Pop()
    }

    TrackUp(signal, *) {
        if this.Held.Has(signal)
            this.Held[signal] := false
    }

    TrackShortcutDown(trigger, *) {
        if this.L1Held.Get(trigger, false)
            return

        this.L1Held[trigger] := true
        now := IsoNow()
        data := this.ShortcutUsage[trigger]
        data["count"] += 1
        data["lastUsed"] := now

        this.EventCounter += 1
        slot := this.SlotForTrigger(trigger)
        event := Map(
            "id", this.EventCounter,
            "kind", "l1",
            "signal", trigger,
            "slot", slot,
            "time", now,
            "exe", this.Active["exe"],
            "title", this.Active["title"]
        )
        this.Recent.InsertAt(1, event)
        this.AppendHistory("l1", trigger, now, slot)
        while this.Recent.Length > 24
            this.Recent.Pop()
    }

    TrackShortcutUp(trigger, *) {
        this.L1Held[trigger] := false
    }


    SetStudioLayer(body) {
        layer := Trim(body)
        if layer != "1" && layer != "2" && layer != "3"
            layer := ""
        this.StudioLayer := layer
        return layer
    }

    UpdateActiveWindow(*) {
        hwnd := 0
        try hwnd := WinExist("A")
        if !hwnd
            return

        exe := ""
        title := ""
        className := ""
        pid := 0
        try exe := WinGetProcessName("ahk_id " hwnd)
        try title := WinGetTitle("ahk_id " hwnd)
        try className := WinGetClass("ahk_id " hwnd)
        try pid := WinGetPID("ahk_id " hwnd)

        if exe != this.Active["exe"] || title != this.Active["title"] || className != this.Active["class"] {
            this.Active["exe"] := exe
            this.Active["title"] := title
            this.Active["class"] := className
            this.Active["pid"] := pid
            this.Active["changedAt"] := IsoNow()
        }
    }

    StatusJson() {
        usageParts := []
        for signal, data in this.Usage {
            usageParts.Push(Q(signal) ":{" Q("count") ":" data["count"] "," Q("lastUsed") ":" Q(data["lastUsed"]) "}")
        }

        shortcutParts := []
        for trigger, data in this.ShortcutUsage {
            shortcutParts.Push(Q(trigger) ":{" Q("count") ":" data["count"] "," Q("lastUsed") ":" Q(data["lastUsed"]) "}")
        }


        recentParts := []
        for event in this.Recent {
            recentParts.Push("{" Q("id") ":" event["id"] "," Q("kind") ":" Q(event["kind"]) "," Q("signal") ":" Q(event["signal"]) "," Q("slot") ":" Q(event["slot"]) "," Q("time") ":" Q(event["time"]) "," Q("exe") ":" Q(event["exe"]) "," Q("title") ":" Q(event["title"]) "}")
        }

        activeJson := "{" 
            . Q("exe") ":" Q(this.Active["exe"]) ","
            . Q("title") ":" Q(this.Active["title"]) ","
            . Q("class") ":" Q(this.Active["class"]) ","
            . Q("pid") ":" this.Active["pid"] ","
            . Q("changedAt") ":" Q(this.Active["changedAt"]) 
            . "}"

        return "{"
            . Q("ok") ":true,"
            . Q("version") ":" Q(this.Version) ","
            . Q("port") ":" this.Port ","
            . Q("startedAt") ":" Q(this.StartedAt) ","
            . Q("active") ":" activeJson ","
            . Q("usage") ":{" Join(usageParts, ",") "},"
            . Q("shortcutUsage") ":{" Join(shortcutParts, ",") "},"
            . Q("recent") ":[" Join(recentParts, ",") "],"
            . Q("layoutCount") ":" this.L1Triggers.Length ","
            . Q("l2LayoutCount") ":" this.L2Triggers.Length ","
            . Q("studioStateSaved") ":" (FileExist(this.StudioStateFile) ? "true" : "false") ","
            . Q("knownTriggerCount") ":" this.KnownL1Triggers.Length ","
            . Q("historyCount") ":" this.HistoryCount ","
            . Q("studioLayer") ":" Q(this.StudioLayer)
            . "}"
    }

    HandleHttp(method, path, body := "") {
        if method = "OPTIONS"
            return Map("status", 204, "type", "text/plain; charset=utf-8", "body", "")

        cleanPath := StrSplit(path, "?")[1]

        if method = "GET" && (cleanPath = "/" || cleanPath = "/studio" || cleanPath = "/v21-pro-shortcut-studio-v25.html") {
            if FileExist(this.HtmlFile) {
                html := FileRead(this.HtmlFile, "UTF-8")
                return Map("status", 200, "type", "text/html; charset=utf-8", "body", html)
            }

            message := "<!doctype html><meta charset='utf-8'><title>V21 Companion</title>"
                . "<body style='font-family:Segoe UI;padding:40px;background:#111;color:#eee'>"
                . "<h1>V21 Companion is running</h1>"
                . "<p>Place <code>v21-pro-shortcut-studio-v25.html</code> beside this .ahk file, then reload.</p>"
                . "</body>"
            return Map("status", 404, "type", "text/html; charset=utf-8", "body", message)
        }

        if method = "GET" && cleanPath = "/status"
            return Map("status", 200, "type", "application/json; charset=utf-8", "body", this.StatusJson())

        if method = "POST" && cleanPath = "/layout" {
            count := this.ApplyLayout(body)
            return Map("status", 200, "type", "application/json; charset=utf-8", "body", "{" Q("ok") ":true," Q("count") ":" count "}")
        }

        if method = "POST" && cleanPath = "/l2-layout" {
            count := this.ApplyL2Layout(body)
            return Map("status", 200, "type", "application/json; charset=utf-8", "body", "{" Q("ok") ":true," Q("count") ":" count "}")
        }

        if method = "POST" && cleanPath = "/studio-layer" {
            layer := this.SetStudioLayer(body)
            return Map("status", 200, "type", "application/json; charset=utf-8", "body", "{" Q("ok") ":true," Q("layer") ":" Q(layer) "}")
        }

        if method = "GET" && cleanPath = "/studio-state" {
            data := FileExist(this.StudioStateFile) ? FileRead(this.StudioStateFile, "UTF-8") : "{}"
            return Map("status", 200, "type", "application/json; charset=utf-8", "body", data)
        }

        if method = "POST" && cleanPath = "/studio-state" {
            try FileDelete(this.StudioStateFile)
            FileAppend(body != "" ? body : "{}", this.StudioStateFile, "UTF-8")
            return Map("status", 200, "type", "application/json; charset=utf-8", "body", "{" Q("ok") ":true}")
        }

        if method = "GET" && cleanPath = "/site-runtime" {
            data := this.SiteRuntimeJson != "" ? this.SiteRuntimeJson : "{}"
            return Map("status", 200, "type", "application/json; charset=utf-8", "body", data)
        }

        if method = "POST" && cleanPath = "/site-runtime" {
            this.SiteRuntimeJson := body != "" ? body : "{}"
            return Map("status", 200, "type", "application/json; charset=utf-8", "body", "{" Q("ok") ":true}")
        }

        if method = "POST" && cleanPath = "/reset-usage" {
            this.ResetUsage()
            return Map("status", 200, "type", "application/json; charset=utf-8", "body", "{" Q("ok") ":true}")
        }

        if cleanPath = "/favicon.ico"
            return Map("status", 204, "type", "image/x-icon", "body", "")

        return Map("status", 404, "type", "application/json; charset=utf-8", "body", "{" Q("ok") ":false," Q("error") ":" Q("Not found") "}")
    }

    Shutdown(*) {
        try this.SaveUsage()
        try this.UnregisterL1Hotkeys()
        try this.UnregisterL2Hotkeys()
        try this.Server.Close()
    }
}

class V21HttpServer {
    __New(owner, port) {
        this.Owner := owner
        this.Port := port
        this.Clients := Map()
        this.WsaData := Buffer(512, 0)

        result := DllCall("Ws2_32\WSAStartup", "UShort", 0x0202, "Ptr", this.WsaData.Ptr, "Int")
        if result != 0
            throw Error("WSAStartup failed: " result)

        this.ListenSocket := DllCall("Ws2_32\socket", "Int", 2, "Int", 1, "Int", 6, "Ptr")
        if IsInvalidSocket(this.ListenSocket)
            throw Error("socket() failed: " WsaError())

        reuse := Buffer(4, 0)
        NumPut("Int", 1, reuse, 0)
        DllCall("Ws2_32\setsockopt", "Ptr", this.ListenSocket, "Int", 0xFFFF, "Int", 0x0004, "Ptr", reuse.Ptr, "Int", 4, "Int")

        address := Buffer(16, 0)
        NumPut("UShort", 2, address, 0)
        NumPut("UShort", DllCall("Ws2_32\htons", "UShort", port, "UShort"), address, 2)
        NumPut("UInt", DllCall("Ws2_32\inet_addr", "AStr", "127.0.0.1", "UInt"), address, 4)

        if DllCall("Ws2_32\bind", "Ptr", this.ListenSocket, "Ptr", address.Ptr, "Int", address.Size, "Int") != 0
            throw Error("bind() failed. Port " port " may already be in use. Winsock: " WsaError())

        if DllCall("Ws2_32\listen", "Ptr", this.ListenSocket, "Int", 16, "Int") != 0
            throw Error("listen() failed: " WsaError())

        mode := Buffer(4, 0)
        NumPut("UInt", 1, mode, 0)
        DllCall("Ws2_32\ioctlsocket", "Ptr", this.ListenSocket, "UInt", 0x8004667E, "Ptr", mode.Ptr, "Int")

        this.PollCallback := ObjBindMethod(this, "Poll")
        SetTimer(this.PollCallback, 20)
    }

    Poll(*) {
        this.AcceptClients()
        sockets := []
        for socket in this.Clients
            sockets.Push(socket)

        for socket in sockets
            this.ReadClient(socket)
    }

    AcceptClients() {
        Loop 8 {
            client := DllCall("Ws2_32\accept", "Ptr", this.ListenSocket, "Ptr", 0, "Ptr", 0, "Ptr")
            if IsInvalidSocket(client) {
                if WsaError() = 10035
                    return
                return
            }

            mode := Buffer(4, 0)
            NumPut("UInt", 1, mode, 0)
            DllCall("Ws2_32\ioctlsocket", "Ptr", client, "UInt", 0x8004667E, "Ptr", mode.Ptr, "Int")
            ; Keep raw bytes until the complete UTF-8 request has arrived.
            this.Clients[client] := Map("data", Buffer(16384, 0), "length", 0,
                "headerBytes", 0, "headerScan", 0, "contentLength", 0, "started", A_TickCount)
        }
    }

    ReadClient(socket) {
        if !this.Clients.Has(socket)
            return

        client := this.Clients[socket]
        receiveBuffer := Buffer(16384, 0)
        peerClosed := false

        Loop 4 {
            received := DllCall("Ws2_32\recv", "Ptr", socket, "Ptr", receiveBuffer.Ptr, "Int", receiveBuffer.Size, "Int", 0, "Int")
            if received > 0 {
                oldLength := client["length"]
                newLength := oldLength + received
                if newLength > client["data"].Size {
                    expanded := Buffer(Max(newLength, client["data"].Size * 2), 0)
                    DllCall("RtlMoveMemory", "Ptr", expanded.Ptr, "Ptr", client["data"].Ptr, "UPtr", oldLength)
                    client["data"] := expanded
                }
                DllCall("RtlMoveMemory", "Ptr", client["data"].Ptr + oldLength, "Ptr", receiveBuffer.Ptr, "UPtr", received)
                client["length"] := newLength
                continue
            }

            if received = 0 {
                peerClosed := true
                break
            }

            errorCode := WsaError()
            if errorCode != 10035 {
                this.CloseClient(socket)
                return
            }
            break
        }

        if this.RequestComplete(client)
            this.ProcessRequest(socket, client)
        else if peerClosed || A_TickCount - client["started"] > 5000
            this.CloseClient(socket)
    }

    RequestComplete(client) {
        if !client["headerBytes"] {
            ; CRLFCRLF can itself be split between two recv() calls.
            start := client["headerScan"]
            Loop Max(0, client["length"] - start - 3) {
                offset := start + A_Index - 1
                if NumGet(client["data"], offset, "UInt") = 0x0A0D0A0D {
                    client["headerBytes"] := offset + 4
                    break
                }
            }
            if !client["headerBytes"] {
                client["headerScan"] := Max(0, client["length"] - 3)
                return false
            }
            header := StrGet(client["data"], client["headerBytes"], "UTF-8")
            if RegExMatch(header, "im)^Content-Length:[ \t]*(\d+)", &match)
                client["contentLength"] := match[1] + 0
        }
        return client["length"] >= client["headerBytes"] + client["contentLength"]
    }

    ProcessRequest(socket, client) {
        header := StrGet(client["data"], client["headerBytes"], "UTF-8")
        firstLine := StrSplit(header, "`r`n")[1]
        parts := StrSplit(firstLine, " ")
        method := parts.Length >= 1 ? parts[1] : "GET"
        path := parts.Length >= 2 ? parts[2] : "/"
        body := client["contentLength"]
            ? StrGet(client["data"].Ptr + client["headerBytes"], client["contentLength"], "UTF-8") : ""

        try response := this.Owner.HandleHttp(method, path, body)
        catch as err {
            response := Map("status", 500, "type", "application/json; charset=utf-8", "body", "{" Q("ok") ":false," Q("error") ":" Q(err.Message) "}")
        }

        this.SendResponse(socket, response)
        this.CloseClient(socket)
    }

    SendResponse(socket, response) {
        mode := Buffer(4, 0)
        NumPut("UInt", 0, mode, 0)
        DllCall("Ws2_32\ioctlsocket", "Ptr", socket, "UInt", 0x8004667E, "Ptr", mode.Ptr, "Int")

        sendTimeout := Buffer(4, 0)
        NumPut("Int", 3000, sendTimeout, 0)
        DllCall("Ws2_32\setsockopt", "Ptr", socket, "Int", 0xFFFF, "Int", 0x1005, "Ptr", sendTimeout.Ptr, "Int", 4, "Int")

        status := response.Get("status", 200)
        body := response.Get("body", "")
        contentType := response.Get("type", "text/plain; charset=utf-8")
        reasonPhrase := StatusText(status)
        bodyLength := StrPut(body, "UTF-8") - 1

        headers := "HTTP/1.1 " status " " reasonPhrase "`r`n"
            . "Content-Type: " contentType "`r`n"
            . "Content-Length: " bodyLength "`r`n"
            . "Cache-Control: no-store`r`n"
            . "Access-Control-Allow-Origin: *`r`n"
            . "Access-Control-Allow-Methods: GET, POST, OPTIONS`r`n"
            . "Access-Control-Allow-Headers: Content-Type, Accept`r`n"
            . "Access-Control-Allow-Private-Network: true`r`n"
            . "Connection: close`r`n`r`n"

        payload := headers body
        size := StrPut(payload, "UTF-8")
        output := Buffer(size, 0)
        StrPut(payload, output, "UTF-8")

        sentTotal := 0
        bytesToSend := size - 1
        while sentTotal < bytesToSend {
            sent := DllCall("Ws2_32\send", "Ptr", socket, "Ptr", output.Ptr + sentTotal, "Int", bytesToSend - sentTotal, "Int", 0, "Int")
            if sent <= 0
                break
            sentTotal += sent
        }
    }

    CloseClient(socket) {
        if this.Clients.Has(socket)
            this.Clients.Delete(socket)
        try DllCall("Ws2_32\closesocket", "Ptr", socket, "Int")
    }

    Close() {
        try SetTimer(this.PollCallback, 0)
        sockets := []
        for socket in this.Clients
            sockets.Push(socket)
        for socket in sockets
            this.CloseClient(socket)
        try DllCall("Ws2_32\closesocket", "Ptr", this.ListenSocket, "Int")
        try DllCall("Ws2_32\WSACleanup", "Int")
    }
}


ArrayHasValue(items, value) {
    for item in items {
        if item = value
            return true
    }
    return false
}

HumanTriggerToHotkey(trigger) {
    parts := StrSplit(trigger, "+")
    if !parts.Length
        return ""

    key := parts.Pop()
    prefix := ""
    for part in parts {
        token := StrLower(Trim(part))
        switch token {
            case "ctrl", "control": prefix .= "^"
            case "alt": prefix .= "!"
            case "shift": prefix .= "+"
            case "win", "meta", "cmd": prefix .= "#"
        }
    }

    key := NormalizeAhkKey(key)
    return key = "" ? "" : prefix key
}

NormalizeAhkKey(key) {
    token := StrLower(Trim(key))
    switch token {
        case "esc", "escape": return "Esc"
        case "space": return "Space"
        case "enter": return "Enter"
        case "tab": return "Tab"
        case "backspace": return "Backspace"
        case "delete": return "Delete"
        case "up": return "Up"
        case "down": return "Down"
        case "left": return "Left"
        case "right": return "Right"
        case "plus", "equal": return "vkBB"
        case "minus": return "vkBD"
        case "bracketleft": return "vkDB"
        case "bracketright": return "vkDD"
        case "semicolon": return "vkBA"
        case "quote": return "vkDE"
        case "comma": return "vkBC"
        case "period": return "vkBE"
        case "slash": return "vkBF"
        case "backslash": return "vkDC"
        case "backtick": return "vkC0"
    }

    if RegExMatch(key, "i)^F([1-9]|1[0-9]|2[0-4])$")
        return StrUpper(key)
    if StrLen(key) = 1
        return key
    if RegExMatch(key, "i)^(Home|End|PgUp|PgDn|Insert|CapsLock|ScrollLock|Pause|PrintScreen|AppsKey)$")
        return key
    return key
}

StatusText(status) {
    switch status {
        case 200: return "OK"
        case 204: return "No Content"
        case 404: return "Not Found"
        case 500: return "Internal Server Error"
        default: return "OK"
    }
}

IsInvalidSocket(socket) {
    return socket = -1 || (A_PtrSize = 4 && socket = 0xFFFFFFFF)
}

WsaError() {
    return DllCall("Ws2_32\WSAGetLastError", "Int")
}

IsoNow() {
    return FormatTime(, "yyyy-MM-dd'T'HH:mm:ss")
}

SafeIniKey(value) {
    return RegExReplace(String(value), "[^A-Za-z0-9]", "_")
}

Join(items, delimiter := ",") {
    result := ""
    for index, item in items
        result .= (index > 1 ? delimiter : "") item
    return result
}

JsonEscape(value) {
    text := String(value)
    text := StrReplace(text, "\", "\\")
    text := StrReplace(text, Chr(34), "\" . Chr(34))
    text := StrReplace(text, "`r", "\r")
    text := StrReplace(text, "`n", "\n")
    text := StrReplace(text, "`t", "\t")
    return text
}

Q(value) {
    return Chr(34) . JsonEscape(value) . Chr(34)
}

TrackSignalDown(signal) {
    global Companion
    Companion.TrackDown(signal)
}

TrackSignalUp(signal) {
    global Companion
    Companion.TrackUp(signal)
}


try Companion := V21CompanionApp(32145)
catch as startupErr {
    MsgBox("V21 Companion could not start.`n`n" startupErr.Message, "V21 Companion", "Iconx")
    ExitApp()
}


