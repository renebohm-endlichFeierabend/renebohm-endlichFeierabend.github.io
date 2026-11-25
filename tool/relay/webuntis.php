<?php
/**
 * WebUntis-Brücke des Feierabend-Notenbuchs (für Lehrkräfte ohne Cockpit).
 *
 * Läuft auf dem Webspace der Schule (Strato). Das Notenbuch im Browser schickt WebUntis-Benutzername und
 * -Passwort der Lehrkraft zusammen mit einem Auftrag hierher; das Skript meldet sich damit bei WebUntis an,
 * führt den Auftrag aus und antwortet. Es speichert und protokolliert nichts: keine Passwörter, keine Noten,
 * keine Namen. Die Daten des Notenbuchs bleiben im Browser der Lehrkraft.
 *
 * Aufträge (POST, JSON):
 *   {"aktion":"pruefen"}                         Anmeldung testen
 *   {"aktion":"kurse"}                           eigener Unterricht (lessonlist.do?my=true)
 *   {"aktion":"schueler","lsId":123}             Schülerliste eines Unterrichts
 *   {"aktion":"matrix","lsId":123}               Noten, Notenarten, Prüfungen, Notenschlüssel
 *   {"aktion":"eintragen","lsId":123,"eintraege":[...]}   Noten eintragen, danach Kontrolle an der Matrix
 * jeweils mit "benutzer" und "passwort".
 *
 * Gleicher Ablauf wie cockpit/webuntis.py (Cockpit auf ReneLXC), dort ist er dokumentiert und erprobt.
 * Server und Schule sind fest eingetragen, damit das Skript kein offener Weiterleiter ist.
 */
declare(strict_types=1);

const WU_SERVER = 'liebfrauenschule-grefrath.webuntis.com';
const WU_SCHULE = 'liebfrauenschule-grefrath';
const ERLAUBTE_HERKUNFT = [
    'https://renebohm-endlichfeierabend.github.io',
    'https://endlich-feierabend-ki.de',
];
const MAX_ANFRAGE = 300000;          // Bytes
const MAX_EINTRAEGE = 60;
const ANFRAGEN_JE_MINUTE = 40;       // je Absender

// ---------- Rahmen: Herkunft, Methode, Drossel ----------

$herkunft = $_SERVER['HTTP_ORIGIN'] ?? '';
if ($herkunft !== '' && in_array($herkunft, ERLAUBTE_HERKUNFT, true)) {
    header('Access-Control-Allow-Origin: ' . $herkunft);
    header('Vary: Origin');
    header('Access-Control-Allow-Methods: POST, OPTIONS');
    header('Access-Control-Allow-Headers: Content-Type');
    header('Access-Control-Max-Age: 600');
}
header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: no-store');
header('X-Content-Type-Options: nosniff');
header('Referrer-Policy: no-referrer');

function antwort(array $daten, int $code = 200): never {
    http_response_code($code);
    echo json_encode($daten, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    exit;
}

if (($_SERVER['REQUEST_METHOD'] ?? '') === 'OPTIONS') {
    http_response_code(204);
    exit;
}
if (($_SERVER['REQUEST_METHOD'] ?? '') !== 'POST') {
    antwort(['fehler' => 'Nur POST.'], 405);
}
if ($herkunft !== '' && !in_array($herkunft, ERLAUBTE_HERKUNFT, true)) {
    antwort(['fehler' => 'Herkunft nicht erlaubt.'], 403);
}

function drossel(): void {
    $ip = $_SERVER['REMOTE_ADDR'] ?? 'x';
    $datei = sys_get_temp_dir() . '/nb-wu-' . hash('sha256', $ip . __FILE__) . '.json';
    $jetzt = time();
    $zeiten = [];
    if (is_file($datei)) {
        $zeiten = json_decode((string)@file_get_contents($datei), true) ?: [];
    }
    $zeiten = array_values(array_filter($zeiten, fn($t) => is_int($t) && $jetzt - $t < 60));
    if (count($zeiten) >= ANFRAGEN_JE_MINUTE) {
        antwort(['fehler' => 'Zu viele Anfragen. Bitte eine Minute warten.'], 429);
    }
    $zeiten[] = $jetzt;
    @file_put_contents($datei, json_encode($zeiten), LOCK_EX);
}
drossel();

$roh = file_get_contents('php://input', false, null, 0, MAX_ANFRAGE + 1);
if ($roh === false || strlen($roh) > MAX_ANFRAGE) {
    antwort(['fehler' => 'Anfrage zu groß.'], 413);
}
$auftrag = json_decode($roh, true);
if (!is_array($auftrag)) {
    antwort(['fehler' => 'Ungültige Anfrage.'], 400);
}
$benutzer = trim((string)($auftrag['benutzer'] ?? ''));
$passwort = (string)($auftrag['passwort'] ?? '');
if ($benutzer === '' || $passwort === '' || strlen($benutzer) > 100 || strlen($passwort) > 200) {
    antwort(['fehler' => 'WebUntis-Benutzername und Passwort fehlen.'], 400);
}

// ---------- WebUntis-Sitzung ----------

final class UntisFehler extends RuntimeException {}

final class Sitzung {
    private $c;
    private string $basis;
    private string $csrf = '';
    private string $tenant = '';

    public function __construct(private string $benutzer, private string $passwort) {
        $this->basis = 'https://' . WU_SERVER . '/WebUntis';
        $this->c = curl_init();
        curl_setopt_array($this->c, [
            CURLOPT_RETURNTRANSFER => true, CURLOPT_FOLLOWLOCATION => true, CURLOPT_MAXREDIRS => 5,
            CURLOPT_TIMEOUT => 40, CURLOPT_CONNECTTIMEOUT => 10, CURLOPT_COOKIEFILE => '',
            CURLOPT_USERAGENT => 'Mozilla/5.0 (feierabend-notenbuch)', CURLOPT_HEADER => false,
            CURLOPT_PROTOCOLS => CURLPROTO_HTTPS, CURLOPT_REDIR_PROTOCOLS => CURLPROTO_HTTPS,
        ]);
        $this->anmelden();
    }

    private function roh(string $methode, string $url, array $kopf = [], ?string $inhalt = null): array {
        curl_setopt($this->c, CURLOPT_URL, $url);
        curl_setopt($this->c, CURLOPT_CUSTOMREQUEST, $methode);
        curl_setopt($this->c, CURLOPT_POSTFIELDS, $inhalt);
        if ($methode === 'GET') {
            curl_setopt($this->c, CURLOPT_HTTPGET, true);
        }
        curl_setopt($this->c, CURLOPT_HTTPHEADER, $kopf);
        $text = curl_exec($this->c);
        if ($text === false) {
            throw new UntisFehler('WebUntis ist nicht erreichbar.');
        }
        return [(int)curl_getinfo($this->c, CURLINFO_RESPONSE_CODE), (string)$text,
                (string)curl_getinfo($this->c, CURLINFO_CONTENT_TYPE)];
    }

    private function anmelden(): void {
        $this->roh('GET', $this->basis . '/?school=' . rawurlencode(WU_SCHULE));
        [, $text] = $this->roh('POST', $this->basis . '/j_spring_security_check', ['Accept: application/json'],
            http_build_query(['school' => WU_SCHULE, 'j_username' => $this->benutzer,
                              'j_password' => $this->passwort, 'token' => '']));
        $j = json_decode($text, true);
        if (!is_array($j) || ($j['state'] ?? '') !== 'SUCCESS') {
            throw new UntisFehler('Anmeldung bei WebUntis fehlgeschlagen. Benutzername oder Passwort prüfen.');
        }
        [, $seite] = $this->roh('GET', $this->basis . '/embedded.do?showSidebar=false');
        if (preg_match('/"csrfToken":"([^"]+)"/', $seite, $m)) {
            $this->csrf = $m[1];
        }
        if (preg_match('/"tenantId":"?(\d+)/', $seite, $m)) {
            $this->tenant = $m[1];
        }
    }

    public function anfrage(string $methode, string $pfad, array $params = [], $body = null, bool $roh = false) {
        $url = $this->basis . '/' . $pfad . ($params ? '?' . http_build_query($params) : '');
        $kopf = ['Accept: application/json'];
        if ($this->tenant !== '') {
            $kopf[] = 'Tenant-Id: ' . $this->tenant;
        }
        if ($methode !== 'GET') {
            $kopf[] = 'Content-Type: application/json';
            $kopf[] = 'X-CSRF-TOKEN: ' . $this->csrf;
        }
        [$code, $text, $typ] = $this->roh($methode, $url, $kopf, $body === null ? null : json_encode($body));
        if ($roh) {
            if (str_contains(substr($text, 0, 5000), 'j_spring_security_check')) {
                throw new UntisFehler('WebUntis-Sitzung abgelaufen.');
            }
            return $text;
        }
        $j = json_decode($text, true);
        if (!is_array($j)) {
            throw new UntisFehler("WebUntis antwortet nicht mit JSON ($code).");
        }
        if ($code >= 400 || !empty($j['errors']) || !empty($j['isSessionTimeout'])) {
            throw new UntisFehler('WebUntis meldet einen Fehler (' . $code . ').');
        }
        return array_key_exists('data', $j) ? $j['data'] : $j;
    }
}

function text_aus(string $fragment): string {
    $fragment = preg_replace('~<tooltip>.*?</tooltip>|<script.*?</script>|<[^>]+>~s', ' ', $fragment);
    return trim(preg_replace('~\s+~u', ' ', html_entity_decode($fragment, ENT_QUOTES | ENT_HTML5, 'UTF-8')));
}

function datum_aus($wert): string {
    $s = (string)($wert ?? '');
    return strlen($s) === 8 ? substr($s, 0, 4) . '-' . substr($s, 4, 2) . '-' . substr($s, 6, 2) : '';
}

function datum_nach(string $iso): int {
    $d = DateTime::createFromFormat('!Y-m-d', $iso);
    if (!$d || $d->format('Y-m-d') !== $iso) {
        throw new UntisFehler('Ungültiges Datum.');
    }
    return (int)str_replace('-', '', $iso);
}

function kurse(Sitzung $s): array {
    $t = $s->anfrage('GET', 'lessonlist.do', ['my' => 'true'], null, true);
    $aus = [];
    preg_match_all('~<tr[^>]*>(.*?)</tr>~s', $t, $zeilen);
    foreach ($zeilen[1] as $tr) {
        if (!preg_match('~lessonstudentlist\?lsid=(\d+)~', $tr, $m)) {
            continue;
        }
        preg_match_all('~<td[^>]*>(.*?)</td>~s', $tr, $td);
        $zellen = array_map('text_aus', $td[1]);
        preg_match_all('~<tooltip>(.*?)</tooltip>~s', $tr, $tt);
        $tipps = array_map(fn($x) => html_entity_decode(trim($x), ENT_QUOTES | ENT_HTML5, 'UTF-8'), $tt[1]);
        if (count($zellen) < 6 || $zellen[2] !== 'Unterricht') {
            continue;
        }
        $klassen = ($tipps[0] ?? '') !== '' ? $tipps[0] : $zellen[3];
        if ($klassen === '' || mb_strlen($klassen) > 20 || $zellen[5] === 'AUFSICHT') {
            continue;
        }
        $aus[] = ['lsId' => (int)$m[1], 'klassen' => $klassen, 'gruppe' => $zellen[4], 'fach' => $zellen[5],
                  'fachname' => $tipps[1] ?? $zellen[5]];
    }
    return $aus;
}

function schuelerliste(Sitzung $s, int $lsId): array {
    $t = $s->anfrage('GET', 'lessonstudentlist.do', ['lsid' => $lsId, 'startDate' => date('Ymd')], null, true);
    preg_match_all('~<th[^>]*>(.*?)</th>~s', $t, $th);
    $kopf = array_map('text_aus', $th[1]);
    $iNach = array_search('Familienname', $kopf, true);
    $iVor = array_search('Vorname', $kopf, true);
    if ($iNach === false || $iVor === false) {
        throw new UntisFehler('Schülerliste hat ein unbekanntes Format.');
    }
    $iKl = array_search('Klasse', $kopf, true);
    $iAus = array_search('Austrittsdatum', $kopf, true);
    $aus = [];
    preg_match_all('~<tr[^>]*>(.*?)</tr>~s', $t, $zeilen);
    foreach ($zeilen[1] as $tr) {
        preg_match_all('~<td[^>]*>(.*?)</td>~s', $tr, $td);
        $zellen = array_map('text_aus', $td[1]);
        if (!preg_match('~studentId=(\d+)~', $tr, $m) || count($zellen) <= max($iNach, $iVor)) {
            continue;
        }
        $aus[] = ['id' => (int)$m[1], 'nachname' => $zellen[$iNach], 'vorname' => $zellen[$iVor],
                  'klasse' => $iKl !== false ? ($zellen[$iKl] ?? '') : '',
                  'austritt' => $iAus !== false ? ($zellen[$iAus] ?? '') : ''];
    }
    return $aus;
}

function matrix(Sitzung $s, int $lsId): array {
    $meta = $s->anfrage('GET', 'api/classreg/gradesmatrix/meta', ['lessonId' => $lsId]);
    $jahr = $meta['schoolyear']['id'];
    $daten = $s->anfrage('GET', 'api/classreg/gradesmatrix/data', ['lsId' => $lsId, 'schoolyearOrSemesterId' => $jahr]);
    $rows = $daten['rows'] ?? [];
    if (!$rows) {
        throw new UntisFehler('Der Unterricht hat keine Schüler.');
    }
    $ed = $s->anfrage('GET', 'api/classreg/grade/gradeEditor/meta', ['lessonId' => $lsId,
        'studentId' => $rows[0]['student']['id'], 'examId' => -1, 'gradeId' => -1, 'periodId' => -1]);
    $schemata = $ed['markSchemata'] ?? [];
    $schema = null;
    foreach ($schemata as $x) {
        if ($x['id'] === ($ed['defaultMarkSchemaId'] ?? null)) { $schema = $x; }
    }
    $schema ??= $schemata[0] ?? null;
    $schueler = [];
    foreach ($rows as $r) {
        $noten = [];
        foreach (($r['grades'] ?? []) as $g) {
            $noten[] = ['id' => $g['id'], 'examTypeId' => $g['examTypeId'], 'art' => $g['examType']['name'],
                        'examId' => ($g['exam']['id'] ?? null) ?: (($g['examId'] ?? null) ?: 0),
                        'note' => $g['mark']['name'], 'datum' => datum_aus($g['date'] ?? null),
                        'text' => $g['text'] ?? ''];
        }
        usort($noten, fn($a, $b) => [$a['datum'], $a['art']] <=> [$b['datum'], $b['art']]);
        $schueler[] = ['id' => $r['student']['id'], 'name' => $r['student']['name'], 'noten' => $noten];
    }
    $pruefungen = [];
    foreach (($daten['gradeColumns'] ?? []) as $c) {
        if (empty($c['exam'])) { continue; }
        $pruefungen[] = ['examId' => $c['exam']['id'], 'name' => $c['exam']['name'],
                         'datum' => datum_aus($c['exam']['date'] ?? null), 'examTypeId' => $c['examType']['id'],
                         'art' => ($c['examType']['longname'] ?? '') ?: $c['examType']['name']];
    }
    return [
        'lsId' => $lsId,
        'kurs' => $meta['lesson'] ?? null,
        'schuljahr' => $meta['schoolyear']['name'],
        'darfAnlegen' => (bool)($meta['canCreateGrade'] ?? false),
        'darfAendern' => (bool)($meta['canWriteGrade'] ?? false),
        'notenarten' => array_map(fn($e) => ['id' => $e['id'], 'name' => ($e['longname'] ?? '') ?: $e['name'],
            'kurz' => $e['name'], 'markSchemaId' => $e['markSchemaId']], $ed['examTypes'] ?? []),
        'pruefungen' => $pruefungen,
        'notenschluessel' => $schema ? ['id' => $schema['id'], 'name' => $schema['name'],
            'noten' => array_map(fn($m) => ['id' => $m['id'], 'name' => $m['name']], $schema['marks'])] : null,
        'schueler' => $schueler,
    ];
}

/** Wie eintragen() in cockpit/webuntis.py. Mit $probe werden die Aufrufe nur gebaut, nicht gesendet. */
function eintragen(Sitzung $s, int $lsId, array $eintraege, bool $probe = false): array {
    $vorher = matrix($s, $lsId);
    $pruefungen = array_column($vorher['pruefungen'], null, 'examId');
    $schl = $vorher['notenschluessel'] ?? throw new UntisFehler('Kein Notenschlüssel gefunden.');
    $marks = array_column($schl['noten'], 'id', 'name');
    $arten = array_column($vorher['notenarten'], null, 'id');
    $schueler = array_column($vorher['schueler'], null, 'id');
    $ergebnisse = [];
    $koerper = [];
    foreach ($eintraege as $i => $e) {
        $examId = (int)($e['examId'] ?? -1) ?: -1;
        if ($examId > 0 && isset($pruefungen[$examId])) {
            $e['examTypeId'] = $pruefungen[$examId]['examTypeId'];
            $e['datum'] = $pruefungen[$examId]['datum'];
            $eintraege[$i] = $e;
        }
        $sid = (int)($e['studentId'] ?? 0);
        $art = (int)($e['examTypeId'] ?? 0);
        $note = trim((string)($e['note'] ?? ''));
        $res = ['studentId' => $sid, 'name' => $schueler[$sid]['name'] ?? '?', 'note' => $note];
        try {
            if (!isset($schueler[$sid])) { throw new UntisFehler('Schüler gehört nicht zu diesem Unterricht'); }
            if (!isset($arten[$art])) { throw new UntisFehler('Unbekannte Notenart'); }
            if ($examId > 0 && !isset($pruefungen[$examId])) { throw new UntisFehler('Unbekannte Prüfung'); }
            if (!isset($marks[$note])) { throw new UntisFehler("Note „{$note}“ gibt es im Notenschlüssel nicht"); }
            $gradeId = (int)($e['gradeId'] ?? -1) ?: -1;
            if ($gradeId > 0 && !in_array($gradeId, array_column($schueler[$sid]['noten'], 'id'), true)) {
                throw new UntisFehler('Die zu ändernde Note gehört nicht zu diesem Schüler');
            }
            $body = ['periodId' => -1, 'gradeId' => $gradeId, 'studentId' => $sid, 'lessonId' => $lsId,
                     'examId' => $examId, 'examTypeId' => $art, 'markSchemaId' => $schl['id'],
                     'markId' => $marks[$note], 'text' => mb_substr((string)($e['text'] ?? ''), 0, 200),
                     'date' => datum_nach((string)($e['datum'] ?? ''))];
            if ($probe) {
                $koerper[] = $body;
                $res['status'] = 'probe';
            } else {
                $s->anfrage('POST', 'api/classreg/grade/grade', [], $body);
                $res['status'] = 'gesendet';
            }
        } catch (UntisFehler $f) {
            $res['status'] = 'fehler';
            $res['fehler'] = $f->getMessage();
        }
        $ergebnisse[] = $res;
    }
    if ($probe) {
        return ['ergebnisse' => $ergebnisse, 'aufrufe' => $koerper];
    }
    // Kontrolle: steht die Note jetzt so in WebUntis?
    $nachher = array_column(matrix($s, $lsId)['schueler'], null, 'id');
    foreach ($eintraege as $i => $e) {
        if ($ergebnisse[$i]['status'] !== 'gesendet') { continue; }
        $examId = (int)($e['examId'] ?? -1) ?: -1;
        $da = false;
        foreach ($nachher[(int)$e['studentId']]['noten'] ?? [] as $n) {
            if ($n['examTypeId'] === (int)$e['examTypeId'] && $n['note'] === $ergebnisse[$i]['note']
                && ($examId > 0 ? $n['examId'] === $examId : $n['datum'] === $e['datum'])) {
                $da = true;
            }
        }
        $ergebnisse[$i]['status'] = $da ? 'ok' : 'fehler';
        if (!$da) { $ergebnisse[$i]['fehler'] = 'Nach dem Speichern nicht in WebUntis gefunden'; }
    }
    return ['ergebnisse' => $ergebnisse, 'matrix' => ['schueler' => array_values($nachher)]];
}

// ---------- Auftrag ausführen ----------

$aktion = (string)($auftrag['aktion'] ?? '');
$lsId = (int)($auftrag['lsId'] ?? 0);
try {
    if (!in_array($aktion, ['pruefen', 'kurse', 'schueler', 'matrix', 'eintragen'], true)) {
        antwort(['fehler' => 'Unbekannter Auftrag.'], 400);
    }
    if (in_array($aktion, ['schueler', 'matrix', 'eintragen'], true) && $lsId <= 0) {
        antwort(['fehler' => 'Unterricht (lsId) fehlt.'], 400);
    }
    $s = new Sitzung($benutzer, $passwort);
    unset($passwort, $auftrag['passwort']);
    switch ($aktion) {
        case 'pruefen':
            antwort(['ok' => true]);
        case 'kurse':
            antwort(['kurse' => kurse($s)]);
        case 'schueler':
            antwort(['schueler' => schuelerliste($s, $lsId)]);
        case 'matrix':
            antwort(matrix($s, $lsId));
        case 'eintragen':
            $eintraege = $auftrag['eintraege'] ?? null;
            if (!is_array($eintraege) || !$eintraege || count($eintraege) > MAX_EINTRAEGE) {
                antwort(['fehler' => 'Keine oder zu viele Einträge (höchstens ' . MAX_EINTRAEGE . ').'], 400);
            }
            antwort(eintragen($s, $lsId, array_values($eintraege), !empty($auftrag['probe'])));
    }
} catch (UntisFehler $f) {
    antwort(['fehler' => $f->getMessage()], 502);
} catch (Throwable $f) {
    antwort(['fehler' => 'Interner Fehler in der Brücke.'], 500);
}
