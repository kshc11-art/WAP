param(
    [Parameter(Mandatory=$true)][string]$JobFile,
    [Parameter(Mandatory=$true)][string]$ResultFile,
    [Parameter(Mandatory=$true)][string]$LogFile
)

$ErrorActionPreference = "Stop"

# Eight independent physical HWP table cells.
$FieldSpecs = @(
    @("past_patent",     "[특허권리화/컨설팅]"),
    @("future_patent",   "[특허권리화/컨설팅]"),
    @("past_transfer",   "[기술수요발굴/마케팅/기술이전]"),
    @("future_transfer", "[기술수요발굴/마케팅/기술이전]"),
    @("past_startup",    "[창업/연구소기업/출자회사]"),
    @("future_startup",  "[창업/연구소기업/출자회사]"),
    @("past_other",      "[기타]"),
    @("future_other",    "[기타]")
)

function Write-EngineLog([string]$Text) {
    Add-Content -LiteralPath $LogFile -Value $Text -Encoding UTF8
}

function Normalize-Text([object]$Text) {
    if ($null -eq $Text) {
        return ""
    }

    $value = [string]$Text
    $value = $value.Replace("`r`n", "`n")
    $value = $value.Replace("`r", "`n")

    $controlChar = [string][char]2
    $value = $value.Replace($controlChar, "")

    return $value.Trim()
}

function Get-RegisteredSecurityModuleNames() {
    $names = @()
    $regPath = "HKCU:\Software\HNC\HwpAutomation\Modules"

    try {
        if (Test-Path -LiteralPath $regPath) {
            $item = Get-ItemProperty -LiteralPath $regPath

            foreach ($property in $item.PSObject.Properties) {
                if ($property.Name -like "PS*") {
                    continue
                }

                $path = [string]$property.Value

                if (-not [string]::IsNullOrWhiteSpace($path)) {
                    if (Test-Path -LiteralPath $path) {
                        $names += [string]$property.Name
                    }
                }
            }
        }
    }
    catch {}

    foreach (
        $fallback in @(
            "FilePathCheckerModule",
            "FilePathCheckerModuleExample",
            "SecurityModule"
        )
    ) {
        if ($names -notcontains $fallback) {
            $names += $fallback
        }
    }

    return $names
}

function New-HwpObject([bool]$Visible) {
    $hwp = New-Object -ComObject "HWPFrame.HwpObject"

    try {
        $hwp.XHwpWindows.Active_XHwpWindow.Visible = $Visible
    }
    catch {}

    foreach ($moduleName in (Get-RegisteredSecurityModuleNames)) {
        try {
            if ($hwp.RegisterModule("FilePathCheckDLL", $moduleName)) {
                Write-EngineLog ("Security module active: " + $moduleName)
                break
            }
        }
        catch {}
    }

    return $hwp
}

function Close-HwpObject($hwp) {
    if ($null -eq $hwp) {
        return
    }

    try {
        $hwp.Clear(1)
    }
    catch {
        try {
            $hwp.Quit()
        }
        catch {}
    }

    try {
        [void][Runtime.InteropServices.Marshal]::FinalReleaseComObject($hwp)
    }
    catch {}
}

function Open-Hwp($hwp, [string]$Path) {
    $arg = (
        "lock:false;" +
        "forceopen:true;" +
        "suspendpassword:true;" +
        "versionwarning:false;"
    )

    $ok = $hwp.Open($Path, "", $arg)

    if ($ok -eq $false) {
        throw "Failed to open HWP: $Path"
    }
}

function Find-TextOnce($hwp, [string]$Text) {
    $pset = $hwp.HParameterSet.HFindReplace
    $hwp.HAction.GetDefault("RepeatFind", $pset.HSet)

    $pset.FindString = $Text

    try {
        $pset.Direction = $hwp.FindDir("Forward")
    }
    catch {
        $pset.Direction = 0
    }

    $pset.WholeWordOnly = 0
    $pset.UseWildCards = 0
    $pset.SeveralWords = 0
    $pset.AllWordForms = 0
    $pset.MatchCase = 0
    $pset.ReplaceMode = 0
    $pset.FindRegExp = 0
    $pset.FindJaso = 0
    $pset.HanjaFromHangul = 0
    $pset.IgnoreMessage = 1
    $pset.FindType = 1

    return [bool]$hwp.HAction.Execute(
        "RepeatFind",
        $pset.HSet
    )
}

function Ensure-Fields($hwp) {
    $allExist = $true

    foreach ($spec in $FieldSpecs) {
        if (-not [bool]$hwp.FieldExist([string]$spec[0])) {
            $allExist = $false
            break
        }
    }

    if ($allExist) {
        return
    }

    Write-EngineLog "Tagging eight independent table cells."
    [void]$hwp.Run("MoveDocBegin")

    foreach ($spec in $FieldSpecs) {
        $fieldName = [string]$spec[0]
        $header = [string]$spec[1]

        if (-not (Find-TextOnce $hwp $header)) {
            throw (
                "Cell heading not found: " +
                $fieldName + " / " + $header
            )
        }

        try {
            [void]$hwp.Run("Cancel")
        }
        catch {}

        $ok = $hwp.SetCurFieldName(
            $fieldName,
            0,
            "",
            ""
        )

        if ($ok -eq $false) {
            throw "Failed to tag table cell: $fieldName"
        }

        Write-EngineLog (
            "  cell field: {0} = {1}" -f
            $fieldName,
            $header
        )
    }
}

function Get-PosObject($hwp) {
    $pos = $hwp.GetPosBySet()

    return [PSCustomObject]@{
        List = [int]$pos.Item("List")
        Para = [int]$pos.Item("Para")
        Pos = [int]$pos.Item("Pos")
    }
}

function Same-Pos($A, $B) {
    if ([int]$A.List -ne [int]$B.List) {
        return $false
    }

    if ([int]$A.Para -ne [int]$B.Para) {
        return $false
    }

    if ([int]$A.Pos -ne [int]$B.Pos) {
        return $false
    }

    return $true
}

function Select-DocRange($hwp, $Start, $End) {
    if ([int]$Start.List -ne [int]$End.List) {
        throw "Temporary-document selection crossed a list boundary."
    }

    $ok = $hwp.SetPos(
        [int]$Start.List,
        [int]$Start.Para,
        [int]$Start.Pos
    )

    if ($ok -eq $false) {
        throw "Temporary-document SetPos failed."
    }

    $selected = $hwp.SelectText(
        [int]$Start.Para,
        [int]$Start.Pos,
        [int]$End.Para,
        [int]$End.Pos
    )

    if ($selected -eq $false) {
        throw "Temporary-document SelectText failed."
    }
}

function Get-CellPlainText(
    $hwp,
    [string]$FieldName
) {
    $moved = $hwp.MoveToField(
        $FieldName,
        $true,
        $true,
        $false
    )

    if ($moved -eq $false) {
        return ""
    }

    [void]$hwp.Run("SelectAll")

    try {
        return Normalize-Text $hwp.GetTextFile(
            "TEXT",
            "saveblock"
        )
    }
    finally {
        try {
            [void]$hwp.Run("Cancel")
        }
        catch {}
    }
}

function Get-SelectedRangeText(
    $hwp,
    $Start,
    $End
) {
    if ([int]$Start.List -ne [int]$End.List) {
        return ""
    }

    if (
        [int]$Start.Para -eq [int]$End.Para
    ) {
        if ([int]$Start.Pos -eq [int]$End.Pos) {
            return ""
        }
    }

    Select-DocRange `
        $hwp `
        $Start `
        $End

    try {
        return Normalize-Text $hwp.GetTextFile(
            "TEXT",
            "saveblock"
        )
    }
    finally {
        try {
            [void]$hwp.Run("Cancel")
        }
        catch {}
    }
}

function Remove-TopLevelEmptyParagraphs($hwp) {
    # v0.4.1 spacing normalization.
    #
    # The temporary HWP contains ONE copied physical-cell content block.
    # We remove only truly empty paragraphs on the temporary document's
    # top-level list. Nested table-cell paragraphs use different List ids and
    # are therefore never deleted here.
    #
    # Result:
    #   [heading]
    #   ㅇ first topic
    #   - detail
    #   ㅇ next topic
    #
    # There is exactly one normal paragraph break between adjacent paragraphs,
    # with no extra blank paragraph.
    [void]$hwp.Run("MoveDocBegin")
    $docStart = Get-PosObject $hwp
    $mainList = [int]$docStart.List

    $guard = 0
    $removed = 0

    while ($guard -lt 5000) {
        $guard++

        try {
            [void]$hwp.Run("MoveParaBegin")
        }
        catch {}

        $start = Get-PosObject $hwp

        if ([int]$start.List -ne $mainList) {
            # Defensive: never edit a nested control/table list.
            $nextFromNested = $hwp.Run("MoveNextParaBegin")

            if ($nextFromNested -eq $false) {
                break
            }

            continue
        }

        [void]$hwp.Run("MoveParaEnd")
        $end = Get-PosObject $hwp

        $isLastParagraph = $false

        # Check whether another top-level paragraph exists without permanently
        # leaving this paragraph.
        $savedEnd = $end
        $nextExists = $hwp.Run("MoveNextParaBegin")

        if ($nextExists -eq $false) {
            $isLastParagraph = $true
        }

        $hwp.SetPos(
            [int]$savedEnd.List,
            [int]$savedEnd.Para,
            [int]$savedEnd.Pos
        ) | Out-Null

        $delta = [int]$end.Pos - [int]$start.Pos
        $paragraphText = ""

        if ($delta -gt 0) {
            $paragraphText = Get-SelectedRangeText `
                $hwp `
                $start `
                $end
        }

        $textIsBlank = [string]::IsNullOrWhiteSpace(
            [string]$paragraphText
        )

        # HWP controls are commonly represented by several character positions.
        # Do not delete a control-only paragraph even when TEXT extraction is
        # empty. A true blank paragraph normally has a zero/small position span.
        $looksLikeControl = ($delta -ge 8)

        $isBlankParagraph = (
            $textIsBlank -and
            -not $looksLikeControl
        )

        if ($isBlankParagraph -and -not $isLastParagraph) {
            $hwp.SetPos(
                [int]$start.List,
                [int]$start.Para,
                [int]$start.Pos
            ) | Out-Null

            # Delete at an empty paragraph joins it with the following paragraph,
            # effectively removing only the superfluous paragraph break.
            [void]$hwp.Run("Delete")
            $removed++

            # Stay at the same paragraph index; repeated blank paragraphs are
            # collapsed one by one.
            continue
        }

        $hwp.SetPos(
            [int]$start.List,
            [int]$start.Para,
            [int]$start.Pos
        ) | Out-Null

        $moved = $hwp.Run("MoveNextParaBegin")

        if ($moved -eq $false) {
            break
        }
    }

    Write-EngineLog (
        "    spacing normalize: removed {0} top-level blank paragraphs" -f
        $removed
    )
}

function Get-LeadingPayloadParagraphSkips(
    [string]$WholeText
) {
    $normalized = Normalize-Text $WholeText

    if ([string]::IsNullOrWhiteSpace($normalized)) {
        return -1
    }

    $lines = $normalized -split "`n"

    if ($lines.Count -le 1) {
        return -1
    }

    # Paragraph 0 is the [heading].
    $index = 1

    while ($index -lt $lines.Count) {
        if (-not [string]::IsNullOrWhiteSpace([string]$lines[$index])) {
            break
        }

        $index++
    }

    if ($index -ge $lines.Count) {
        return -1
    }

    return $index
}

function Prepare-CellPayloadClipboard(
    $src,
    $tmp,
    [string]$FieldName
) {
    # Official Hancom cell-content pattern:
    # MoveToField(field) -> SelectAll -> Copy.
    #
    # This selects the CONTENT inside the physical cell rather than using a
    # cell-block selection that would copy the outer table border/cell itself.
    $moved = $src.MoveToField(
        $FieldName,
        $true,
        $true,
        $false
    )

    if ($moved -eq $false) {
        throw "Cannot move to source cell: $FieldName"
    }

    [void]$src.Run("SelectAll")

    try {
        $ok = $src.Run("Copy")

        if ($ok -eq $false) {
            throw "Source cell Copy failed: $FieldName"
        }
    }
    finally {
        try {
            [void]$src.Run("Cancel")
        }
        catch {}
    }

    # Reuse one blank temporary HWP document.
    try {
        $tmp.Clear(1)
    }
    catch {}

    [void]$tmp.Run("MoveDocBegin")

    $pasteOk = $tmp.Run("Paste")

    if ($pasteOk -eq $false) {
        throw "Temporary HWP Paste failed: $FieldName"
    }

    # Remove source-author-specific empty paragraphs without reconstructing
    # text or touching nested table lists.
    Remove-TopLevelEmptyParagraphs $tmp

    # Inspect the temporary document as plain text ONLY to locate the first
    # non-empty payload paragraph after the heading. The actual payload is then
    # copied natively as HWP selection, so tables, bold, fonts and controls are
    # preserved.
    [void]$tmp.Run("SelectAll")

    try {
        $wholeText = Normalize-Text $tmp.GetTextFile(
            "TEXT",
            "saveblock"
        )
    }
    finally {
        try {
            [void]$tmp.Run("Cancel")
        }
        catch {}
    }

    $payloadLineIndex = Get-LeadingPayloadParagraphSkips $wholeText

    if ($payloadLineIndex -lt 1) {
        return $false
    }

    [void]$tmp.Run("MoveDocBegin")

    for ($i = 0; $i -lt $payloadLineIndex; $i++) {
        $movedNext = $tmp.Run("MoveNextParaBegin")

        if ($movedNext -eq $false) {
            return $false
        }
    }

    $start = Get-PosObject $tmp

    [void]$tmp.Run("MoveDocEnd")
    $end = Get-PosObject $tmp

    if (Same-Pos $start $end) {
        return $false
    }

    Select-DocRange $tmp $start $end

    try {
        $copyOk = $tmp.Run("Copy")

        if ($copyOk -eq $false) {
            throw "Temporary payload Copy failed: $FieldName"
        }

        Start-Sleep -Milliseconds 80
    }
    finally {
        try {
            [void]$tmp.Run("Cancel")
        }
        catch {}
    }

    return $true
}

function Paste-PreparedPayload(
    $dest,
    [string]$FieldName
) {
    # start=False means the END of this exact field.
    $moved = $dest.MoveToField(
        $FieldName,
        $true,
        $false,
        $false
    )

    if ($moved -eq $false) {
        throw "Cannot move to destination cell end: $FieldName"
    }

    # One paragraph break separates the existing content from the next response
    # block. We do not clear or rebuild any existing destination information.
    [void]$dest.Run("BreakPara")

    $ok = $dest.Run("Paste")

    if ($ok -eq $false) {
        throw "Destination Paste failed: $FieldName"
    }

    Start-Sleep -Milliseconds 80
}

function Add-TopicCandidates(
    $TopicMap,
    [string]$FieldName,
    [string]$CellText
) {
    if ([string]::IsNullOrWhiteSpace($CellText)) {
        return
    }

    if (-not $TopicMap.ContainsKey($FieldName)) {
        $TopicMap[$FieldName] = @{}
    }

    $fieldMap = $TopicMap[$FieldName]

    foreach ($line in ($CellText -split "`n")) {
        $match = [regex]::Match(
            [string]$line,
            '^\s*[◦○ㅇ]\s*(.+?)\s*$'
        )

        if (-not $match.Success) {
            continue
        }

        $title = $match.Groups[1].Value.Trim()

        if ([string]::IsNullOrWhiteSpace($title)) {
            continue
        }

        if ($fieldMap.ContainsKey($title)) {
            $fieldMap[$title] = [int]$fieldMap[$title] + 1
        }
        else {
            $fieldMap[$title] = 1
        }
    }
}

function Write-DuplicateCandidateLog($TopicMap) {
    Write-EngineLog "Duplicate-topic candidate report (no deletion)."

    $found = $false

    foreach ($fieldName in $TopicMap.Keys) {
        $fieldMap = $TopicMap[$fieldName]

        foreach ($title in $fieldMap.Keys) {
            $count = [int]$fieldMap[$title]

            if ($count -gt 1) {
                $found = $true

                Write-EngineLog (
                    "  duplicate candidate: {0} / {1} / {2} times" -f
                    $fieldName,
                    $title,
                    $count
                )
            }
        }
    }

    if (-not $found) {
        Write-EngineLog "  duplicate candidate: none"
    }
}

function Add-DateReplacementPairs(
    $ReplacementMap,
    [string]$Text
) {
    if ([string]::IsNullOrWhiteSpace($Text)) {
        return
    }

    # 1) Full year-month-day forms.
    #    2026.09.01. -> 2026.9.1.
    #    2027/08/31  -> 2027.8.31.
    #
    # Process these BEFORE standalone M.D forms. The standalone expression
    # intentionally will not start immediately after a year dot.
    $fullDatePattern = (
        '(?<!\d)' +
        '(?<y>\d{4})\s*' +
        '(?<sep1>/|\.)\s*' +
        '(?<m>1[0-2]|0?[1-9])\s*' +
        '(?<sep2>/|\.)\s*' +
        '(?<d>3[01]|[12]\d|0?[1-9])' +
        '(?<trail>\s*\.?)'
    )

    $fullMatches = [regex]::Matches(
        $Text,
        $fullDatePattern
    )

    foreach ($match in $fullMatches) {
        $source = [string]$match.Value
        $year = [int]$match.Groups["y"].Value
        $month = [int]$match.Groups["m"].Value
        $day = [int]$match.Groups["d"].Value

        $target = (
            "{0}.{1}.{2}." -f
            $year,
            $month,
            $day
        )

        if ($source -ne $target) {
            $ReplacementMap[$source] = $target
        }
    }

    # 2) Standalone month-day forms.
    #    09.01.      -> 9.1.
    #    08/25(화)   -> 8.25.(화) after replacing the date portion only.
    #
    # Negative lookbehind prevents matching "09.01." from inside
    # "2026.09.01."; the full-date expression above handles that case.
    $monthDayPattern = (
        '(?<![\d.])' +
        '(?<m>1[0-2]|0?[1-9])\s*' +
        '(?<sep>/|\.)\s*' +
        '(?<d>3[01]|[12]\d|0?[1-9])' +
        '(?<trail>\s*\.?)'
    )

    $monthDayMatches = [regex]::Matches(
        $Text,
        $monthDayPattern
    )

    foreach ($match in $monthDayMatches) {
        $source = [string]$match.Value
        $nextIndex = $match.Index + $match.Length
        $nextChar = ""

        if ($nextIndex -lt $Text.Length) {
            $nextChar = [string]$Text[$nextIndex]
        }

        # Decimal/unit exceptions.
        if ($nextChar -eq "%") {
            continue
        }

        if (-not [string]::IsNullOrEmpty($nextChar)) {
            if ([char]::IsLetter($nextChar[0])) {
                continue
            }
        }

        $month = [int]$match.Groups["m"].Value
        $day = [int]$match.Groups["d"].Value
        $target = ("{0}.{1}." -f $month, $day)

        if ($source -ne $target) {
            $ReplacementMap[$source] = $target
        }
    }
}

function Replace-AllDocument(
    $hwp,
    [string]$FindString,
    [string]$ReplaceString
) {
    if ([string]::IsNullOrEmpty($FindString)) {
        return
    }

    if ($FindString -eq $ReplaceString) {
        return
    }

    Write-EngineLog (
        "Cleanup: '{0}' -> '{1}'" -f
        $FindString,
        $ReplaceString
    )

    [void]$hwp.Run("MoveDocBegin")

    $pset = $hwp.HParameterSet.HFindReplace
    $hwp.HAction.GetDefault("AllReplace", $pset.HSet)

    try {
        $pset.Direction = $hwp.FindDir("AllDoc")
    }
    catch {
        $pset.Direction = 2
    }

    $pset.FindString = $FindString
    $pset.ReplaceString = $ReplaceString
    $pset.ReplaceMode = 1
    $pset.IgnoreMessage = 1
    $pset.FindRegExp = 0
    $pset.FindType = 1

    [void]$hwp.HAction.Execute(
        "AllReplace",
        $pset.HSet
    )
}

function Run-LosslessMerge($job) {
    $baseFile = [string]$job.base_file
    $outputFile = [string]$job.output_file
    $responseFiles = @($job.response_files)
    $keepOpen = [bool]$job.keep_open

    $normalizeSymbols = $true
    $normalizeDates = $true
    $duplicateReport = $true

    if ($null -ne $job.normalize_symbols) {
        $normalizeSymbols = [bool]$job.normalize_symbols
    }

    if ($null -ne $job.normalize_dates) {
        $normalizeDates = [bool]$job.normalize_dates
    }

    if ($null -ne $job.duplicate_report) {
        $duplicateReport = [bool]$job.duplicate_report
    }

    Copy-Item `
        -LiteralPath $baseFile `
        -Destination $outputFile `
        -Force

    $dest = $null
    $tmp = $null

    $results = @()
    $topicMap = @{}
    $dateReplacementMap = @{}

    try {
        $dest = New-HwpObject $false
        Open-Hwp $dest $outputFile
        Ensure-Fields $dest

        # One reusable blank HWP object removes the heading paragraph from each
        # copied cell block before it is inserted into the destination cell.
        $tmp = New-HwpObject $false

        $responseIndex = 0

        foreach ($sourcePath in $responseFiles) {
            $responseIndex++

            Write-EngineLog (
                "Lossless response [{0}/{1}] {2}" -f
                $responseIndex,
                $responseFiles.Count,
                [IO.Path]::GetFileName([string]$sourcePath)
            )

            $src = $null
            $copiedFields = @()
            $skippedFields = @()

            try {
                $src = New-HwpObject $false
                Open-Hwp $src ([string]$sourcePath)
                Ensure-Fields $src

                $fieldIndex = 0

                foreach ($spec in $FieldSpecs) {
                    $fieldIndex++
                    $fieldName = [string]$spec[0]

                    Write-EngineLog (
                        "  cell [{0}/8] {1}" -f
                        $fieldIndex,
                        $fieldName
                    )

                    $cellText = Get-CellPlainText `
                        $src `
                        $fieldName

                    if ($duplicateReport) {
                        Add-TopicCandidates `
                            $topicMap `
                            $fieldName `
                            $cellText
                    }

                    if ($normalizeDates) {
                        Add-DateReplacementPairs `
                            $dateReplacementMap `
                            $cellText
                    }

                    $prepared = Prepare-CellPayloadClipboard `
                        $src `
                        $tmp `
                        $fieldName

                    if (-not $prepared) {
                        $skippedFields += $fieldName
                        Write-EngineLog (
                            "    empty -> skip"
                        )
                        continue
                    }

                    Paste-PreparedPayload `
                        $dest `
                        $fieldName

                    $copiedFields += $fieldName
                    Write-EngineLog (
                        "    copied losslessly"
                    )
                }

                $results += [PSCustomObject]@{
                    source = [string]$sourcePath
                    copied_fields = $copiedFields
                    skipped_fields = $skippedFields
                }
            }
            finally {
                Close-HwpObject $src
            }
        }

        if ($duplicateReport) {
            Write-DuplicateCandidateLog $topicMap
        }

        Write-EngineLog "Non-destructive cleanup phase started."

        if ($normalizeSymbols) {
            Replace-AllDocument $dest "◦" "ㅇ"
            Replace-AllDocument $dest "○" "ㅇ"
        }

        if ($normalizeDates) {
            foreach (
                $source in @(
                    $dateReplacementMap.Keys |
                    Sort-Object {
                        $_.Length
                    } -Descending
                )
            ) {
                Replace-AllDocument `
                    $dest `
                    ([string]$source) `
                    ([string]$dateReplacementMap[$source])
            }
        }

        Write-EngineLog "Non-destructive cleanup phase completed."

        $ok = $dest.SaveAs(
            $outputFile,
            "HWP",
            ""
        )

        if ($ok -eq $false) {
            throw "Failed to save output HWP."
        }

        if ($keepOpen) {
            try {
                $dest.XHwpWindows.Active_XHwpWindow.Visible = $true
                $dest = $null
            }
            catch {}
        }

        return [PSCustomObject]@{
            results = $results
        }
    }
    finally {
        Close-HwpObject $tmp
        Close-HwpObject $dest
    }
}

try {
    $job = Get-Content `
        -LiteralPath $JobFile `
        -Raw `
        -Encoding UTF8 |
        ConvertFrom-Json

    Write-EngineLog "PowerShell COM engine started. mode=lossless"

    $mergeResult = Run-LosslessMerge $job

    [PSCustomObject]@{
        success = $true
        results = @($mergeResult.results)
        smart_fields = @()
        safe_fields = @()
        error = $null
    } |
        ConvertTo-Json -Depth 10 |
        Set-Content `
            -LiteralPath $ResultFile `
            -Encoding UTF8

    Write-EngineLog "PowerShell COM engine completed."
    exit 0
}
catch {
    $msg = $_.Exception.Message
    Write-EngineLog ("ERROR: " + $msg)

    [PSCustomObject]@{
        success = $false
        results = @()
        smart_fields = @()
        safe_fields = @()
        error = $msg
    } |
        ConvertTo-Json -Depth 8 |
        Set-Content `
            -LiteralPath $ResultFile `
            -Encoding UTF8

    exit 1
}
finally {
}
