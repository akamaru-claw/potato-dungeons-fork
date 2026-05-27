<?php
/**
 * Durak Multiplayer API
 * SQLite-based polling backend for ml-bets.com/durak/
 */

header('Content-Type: application/json; charset=utf-8');
header('Access-Control-Allow-Origin: *');
header('Cache-Control: no-cache, no-store, must-revalidate');

$dbFile = __DIR__ . '/durak_rooms.db';

try {
    $db = new PDO('sqlite:' . $dbFile);
    $db->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);
    $db->exec('PRAGMA journal_mode=WAL');
    $db->exec('PRAGMA busy_timeout=5000');
} catch (Exception $e) {
    echo json_encode(['error' => 'DB init failed: ' . $e->getMessage()]);
    exit;
}

// Create tables
$db->exec('CREATE TABLE IF NOT EXISTS rooms (
    id TEXT PRIMARY KEY,
    host_name TEXT NOT NULL,
    num_players INTEGER DEFAULT 4,
    with_transfer INTEGER DEFAULT 0,
    status TEXT DEFAULT "lobby",
    trump_suit TEXT,
    trump_rank TEXT,
    deck_json TEXT,
    created_at INTEGER,
    updated_at INTEGER,
    seq INTEGER DEFAULT 0
)');

$db->exec('CREATE TABLE IF NOT EXISTS players (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    room_id TEXT NOT NULL,
    name TEXT NOT NULL,
    seat INTEGER DEFAULT -1,
    hand_json TEXT DEFAULT "[]",
    is_connected INTEGER DEFAULT 1,
    last_poll INTEGER,
    FOREIGN KEY (room_id) REFERENCES rooms(id)
)');

$db->exec('CREATE TABLE IF NOT EXISTS table_state (
    room_id TEXT PRIMARY KEY,
    attack_json TEXT DEFAULT "[]",
    defend_json TEXT DEFAULT "[]",
    discard_json TEXT DEFAULT "[]",
    current_attacker INTEGER DEFAULT 0,
    current_defender INTEGER DEFAULT 1,
    phase TEXT DEFAULT "lobby",
    round_num INTEGER DEFAULT 1,
    last_action TEXT,
    FOREIGN KEY (room_id) REFERENCES rooms(id)
)');

$db->exec('CREATE TABLE IF NOT EXISTS events (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    room_id TEXT NOT NULL,
    seq INTEGER NOT NULL,
    type TEXT NOT NULL,
    data_json TEXT,
    created_at INTEGER,
    FOREIGN KEY (room_id) REFERENCES rooms(id)
)');

$action = $_GET['action'] ?? $_POST['action'] ?? '';

switch ($action) {
    case 'create':
        doCreate();
        break;
    case 'join':
        doJoin();
        break;
    case 'poll':
        doPoll();
        break;
    case 'start':
        doStart();
        break;
    case 'play_attack':
        doPlayAttack();
        break;
    case 'play_defend':
        doPlayDefend();
        break;
    case 'take':
        doTake();
        break;
    case 'pass':
        doPass();
        break;
    case 'transfer':
        doTransfer();
        break;
    case 'list':
        doList();
        break;
    case 'cleanup':
        doCleanup();
        break;
    default:
        echo json_encode(['error' => 'Unknown action']);
}

// ========== HELPERS ==========

function getDb() { global $db; return $db; }

function jsonResp($data) {
    echo json_encode($data, JSON_UNESCAPED_UNICODE);
    exit;
}

function genRoomId() {
    $chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    $id = '';
    for ($i = 0; $i < 5; $i++) $id .= $chars[random_int(0, strlen($chars)-1)];
    return $id;
}

function addEvent($db, $roomId, $type, $data) {
    $seq = $db->prepare('SELECT seq FROM rooms WHERE id = ?');
    $seq->execute([$roomId]);
    $s = (int)$seq->fetchColumn();
    $s++;
    $db->prepare('UPDATE rooms SET seq = ?, updated_at = ? WHERE id = ?')->execute([$s, time(), $roomId]);
    $db->prepare('INSERT INTO events (room_id, seq, type, data_json, created_at) VALUES (?, ?, ?, ?, ?)')
       ->execute([$roomId, $s, $type, json_encode($data, JSON_UNESCAPED_UNICODE), time()]);
}

function getFullState($db, $roomId, $playerId) {
    // Get room
    $room = $db->prepare('SELECT * FROM rooms WHERE id = ?');
    $room->execute([$roomId]);
    $r = $room->fetch(PDO::FETCH_ASSOC);
    if (!$r) return ['error' => 'Room not found'];

    // Get players
    $pStmt = $db->prepare('SELECT * FROM players WHERE room_id = ? ORDER BY seat');
    $pStmt->execute([$roomId]);
    $players = $pStmt->fetchAll(PDO::FETCH_ASSOC);

    // Get table state
    $tStmt = $db->prepare('SELECT * FROM table_state WHERE room_id = ?');
    $tStmt->execute([$roomId]);
    $table = $tStmt->fetch(PDO::FETCH_ASSOC);

    $mySeat = -1;
    $myHand = [];
    foreach ($players as $p) {
        if ((int)$p['id'] === (int)$playerId) {
            $mySeat = (int)$p['seat'];
            $myHand = json_decode($p['hand_json'], true);
        }
    }

    // Build opponent info (no cards shown)
    $opponents = [];
    foreach ($players as $p) {
        if ((int)$p['id'] !== (int)$playerId) {
            $opponents[] = [
                'name' => $p['name'],
                'seat' => (int)$p['seat'],
                'cardCount' => count(json_decode($p['hand_json'], true)),
                'isConnected' => (int)$p['is_connected']
            ];
        }
    }

    // Get recent events
    $eStmt = $db->prepare('SELECT seq, type, data_json FROM events WHERE room_id = ? ORDER BY seq DESC LIMIT 20');
    $eStmt->execute([$roomId]);
    $events = array_reverse($eStmt->fetchAll(PDO::FETCH_ASSOC));

    return [
        'roomId' => $r['id'],
        'status' => $r['status'],
        'numPlayers' => (int)$r['num_players'],
        'withTransfer' => (int)$r['with_transfer'],
        'trumpSuit' => $r['trump_suit'],
        'trumpRank' => $r['trump_rank'],
        'deckCount' => $r['deck_json'] ? count(json_decode($r['deck_json'], true)) : 0,
        'mySeat' => $mySeat,
        'myHand' => $myHand,
        'opponents' => $opponents,
        'attackCards' => $table ? json_decode($table['attack_json'], true) : [],
        'defendCards' => $table ? json_decode($table['defend_json'], true) : [],
        'currentAttacker' => $table ? (int)$table['current_attacker'] : 0,
        'currentDefender' => $table ? (int)$table['current_defender'] : 1,
        'phase' => $table ? $table['phase'] : 'lobby',
        'roundNum' => $table ? (int)$table['round_num'] : 1,
        'lastAction' => $table ? $table['last_action'] : '',
        'seq' => (int)$r['seq'],
        'events' => array_map(function($e) {
            return ['seq' => (int)$e['seq'], 'type' => $e['type'], 'data' => json_decode($e['data_json'], true)];
        }, $events)
    ];
}

// ========== ACTIONS ==========

function doCreate() {
    $db = getDb();
    $name = trim($_POST['name'] ?? 'Spieler');
    $numPlayers = max(2, min(6, (int)($_POST['num_players'] ?? 4)));
    $withTransfer = (int)($_POST['with_transfer'] ?? 0);
    if (mb_strlen($name) < 1 || mb_strlen($name) > 20) $name = 'Spieler';

    $roomId = genRoomId();
    $now = time();

    $db->prepare('INSERT INTO rooms (id, host_name, num_players, with_transfer, status, created_at, updated_at) VALUES (?, ?, ?, ?, "lobby", ?, ?)')
       ->execute([$roomId, $name, $numPlayers, $withTransfer, $now, $now]);

    $db->prepare('INSERT INTO players (room_id, name, seat, last_poll) VALUES (?, ?, 0, ?)')
       ->execute([$roomId, $name, $now]);

    $playerId = $db->lastInsertId();

    addEvent($db, $roomId, 'room_created', ['name' => $name]);

    $state = getFullState($db, $roomId, $playerId);
    $state['playerId'] = $playerId;
    jsonResp($state);
}

function doJoin() {
    $db = getDb();
    $roomId = strtoupper(trim($_POST['room_id'] ?? ''));
    $name = trim($_POST['name'] ?? 'Spieler');
    if (mb_strlen($name) < 1 || mb_strlen($name) > 20) $name = 'Spieler';

    $rStmt = $db->prepare('SELECT * FROM rooms WHERE id = ?');
    $rStmt->execute([$roomId]);
    $room = $rStmt->fetch(PDO::FETCH_ASSOC);
    if (!$room) jsonResp(['error' => 'Raum nicht gefunden']);
    if ($room['status'] !== 'lobby') jsonResp(['error' => 'Spiel läuft bereits']);

    $pStmt = $db->prepare('SELECT COUNT(*) FROM players WHERE room_id = ?');
    $pStmt->execute([$roomId]);
    $count = (int)$pStmt->fetchColumn();

    if ($count >= (int)$room['num_players']) jsonResp(['error' => 'Raum ist voll']);

    $seat = $count;
    $now = time();

    $db->prepare('INSERT INTO players (room_id, name, seat, last_poll) VALUES (?, ?, ?, ?)')
       ->execute([$roomId, $name, $seat, $now]);

    $playerId = $db->lastInsertId();

    addEvent($db, $roomId, 'player_joined', ['name' => $name, 'seat' => $seat]);

    $state = getFullState($db, $roomId, $playerId);
    $state['playerId'] = $playerId;
    jsonResp($state);
}

function doPoll() {
    $db = getDb();
    $roomId = $_GET['room_id'] ?? '';
    $playerId = (int)($_GET['player_id'] ?? 0);
    $sinceSeq = (int)($_GET['seq'] ?? 0);

    // Update last_poll
    $db->prepare('UPDATE players SET last_poll = ?, is_connected = 1 WHERE id = ? AND room_id = ?')
       ->execute([time(), $playerId, $roomId]);

    // Mark disconnected players (no poll for 30s)
    $db->prepare('UPDATE players SET is_connected = 0 WHERE room_id = ? AND last_poll < ?')
       ->execute([$roomId, time() - 30]);

    $state = getFullState($db, $roomId, $playerId);
    jsonResp($state);
}

function doStart() {
    $db = getDb();
    $roomId = trim($_POST['room_id'] ?? '');
    $playerId = (int)($_POST['player_id'] ?? 0);

    // Verify player is seat 0 (host)
    $pStmt = $db->prepare('SELECT seat FROM players WHERE id = ? AND room_id = ?');
    $pStmt->execute([$playerId, $roomId]);
    $seat = $pStmt->fetchColumn();
    if ((int)$seat !== 0) jsonResp(['error' => 'Nur der Host kann starten']);

    // Get room
    $rStmt = $db->prepare('SELECT * FROM rooms WHERE id = ?');
    $rStmt->execute([$roomId]);
    $room = $rStmt->fetch(PDO::FETCH_ASSOC);
    if (!$room) jsonResp(['error' => 'Raum nicht gefunden']);

    // Count players
    $pStmt2 = $db->prepare('SELECT COUNT(*) FROM players WHERE room_id = ?');
    $pStmt2->execute([$roomId]);
    $count = (int)$pStmt2->fetchColumn();
    if ($count < 2) jsonResp(['error' => 'Mindestens 2 Spieler nötig']);

    // Build deck
    $suits = ['♠','♥','♦','♣'];
    $ranks = ['6','7','8','9','10','J','Q','K','A'];
    $rankValues = ['6'=>6,'7'=>7,'8'=>8,'9'=>9,'10'=>10,'J'=>11,'Q'=>12,'K'=>13,'A'=>14];
    $deck = [];
    foreach ($suits as $s) {
        foreach ($ranks as $r) {
            $deck[] = ['rank' => $r, 'suit' => $s, 'value' => $rankValues[$r]];
        }
    }
    shuffle($deck);

    // Deal 6 cards each
    $allPlayers = $db->prepare('SELECT id, seat FROM players WHERE room_id = ? ORDER BY seat');
    $allPlayers->execute([$roomId]);
    $playerRows = $allPlayers->fetchAll(PDO::FETCH_ASSOC);

    $hands = [];
    foreach ($playerRows as $i => $pr) {
        $hands[$i] = [];
        for ($c = 0; $c < 6; $c++) {
            if (!empty($deck)) {
                $hands[$i][] = array_pop($deck);
            }
        }
        $db->prepare('UPDATE players SET hand_json = ? WHERE id = ?')
           ->execute([json_encode($hands[$i]), $pr['id']]);
    }

    // Trump card is bottom of remaining deck
    $trumpCard = !empty($deck) ? $deck[0] : null;
    $trumpSuit = $trumpCard ? $trumpCard['suit'] : $suits[0];

    // Find first attacker (lowest trump)
    $firstAttacker = 0;
    $lowestTrumpVal = 999;
    foreach ($hands as $i => $hand) {
        foreach ($hand as $card) {
            if ($card['suit'] === $trumpSuit && $card['value'] < $lowestTrumpVal) {
                $lowestTrumpVal = $card['value'];
                $firstAttacker = $i;
            }
        }
    }

    $defender = ($firstAttacker + 1) % $count;

    // Save state
    $db->prepare('UPDATE rooms SET status = "playing", trump_suit = ?, trump_rank = ?, deck_json = ?, updated_at = ? WHERE id = ?')
       ->execute([$trumpSuit, $trumpCard ? $trumpCard['rank'] : '', json_encode($deck), time(), $roomId]);

    $db->prepare('INSERT OR REPLACE INTO table_state (room_id, attack_json, defend_json, current_attacker, current_defender, phase, round_num, last_action) VALUES (?, "[]", "[]", ?, ?, "attack", 1, ?)')
       ->execute([$roomId, $firstAttacker, $defender, "Spiel gestartet!"]);

    addEvent($db, $roomId, 'game_start', ['trumpSuit' => $trumpSuit, 'firstAttacker' => $firstAttacker]);

    $state = getFullState($db, $roomId, $playerId);
    jsonResp($state);
}

function doPlayAttack() {
    $db = getDb();
    $roomId = trim($_POST['room_id'] ?? '');
    $playerId = (int)($_POST['player_id'] ?? 0);
    $card = json_decode($_POST['card'] ?? 'null', true);
    if (!$card) jsonResp(['error' => 'Keine Karte']);

    // Verify it's attacker's turn
    $pStmt = $db->prepare('SELECT seat FROM players WHERE id = ? AND room_id = ?');
    $pStmt->execute([$playerId, $roomId]);
    $mySeat = (int)$pStmt->fetchColumn();

    $tStmt = $db->prepare('SELECT * FROM table_state WHERE room_id = ?');
    $tStmt->execute([$roomId]);
    $table = $tStmt->fetch(PDO::FETCH_ASSOC);
    if (!$table) jsonResp(['error' => 'Kein Spiel']);

    if ((int)$table['current_attacker'] !== $mySeat) jsonResp(['error' => 'Du bist nicht dran']);

    $attacks = json_decode($table['attack_json'], true);
    if (count($attacks) >= 6) jsonResp(['error' => 'Max 6 Angriffskarten']);

    // Verify card can be added (matches rank on table)
    if (count($attacks) > 0) {
        $validRanks = [];
        foreach ($attacks as $a) { $validRanks[] = $a['rank']; }
        $defends = json_decode($table['defend_json'], true);
        foreach ($defends as $d) { $validRanks[] = $d['rank']; }
        if (!in_array($card['rank'], $validRanks)) jsonResp(['error' => 'Karte passt nicht']);
    }

    // Remove card from hand
    $hStmt = $db->prepare('SELECT hand_json FROM players WHERE id = ? AND room_id = ?');
    $hStmt->execute([$playerId, $roomId]);
    $hand = json_decode($hStmt->fetchColumn(), true);
    $found = false;
    foreach ($hand as $i => $c) {
        if ($c['rank'] === $card['rank'] && $c['suit'] === $card['suit']) {
            array_splice($hand, $i, 1);
            $found = true;
            break;
        }
    }
    if (!$found) jsonResp(['error' => 'Karte nicht in der Hand']);
    $db->prepare('UPDATE players SET hand_json = ? WHERE id = ?')->execute([json_encode($hand), $playerId]);

    // Add to attacks
    $attacks[] = ['rank' => $card['rank'], 'suit' => $card['suit'], 'value' => $card['value'], 'attacker' => $mySeat];
    $db->prepare('UPDATE table_state SET attack_json = ?, phase = "defend", last_action = ? WHERE room_id = ?')
       ->execute([json_encode($attacks), "Spieler " . ($mySeat+1) . " greift an", $roomId]);

    addEvent($db, $roomId, 'attack', ['seat' => $mySeat, 'card' => $card]);

    $state = getFullState($db, $roomId, $playerId);
    jsonResp($state);
}

function doPlayDefend() {
    $db = getDb();
    $roomId = trim($_POST['room_id'] ?? '');
    $playerId = (int)($_POST['player_id'] ?? 0);
    $card = json_decode($_POST['card'] ?? 'null', true);
    $attackIdx = (int)($_POST['attack_idx'] ?? -1);
    if (!$card || $attackIdx < 0) jsonResp(['error' => 'Fehlende Parameter']);

    $pStmt = $db->prepare('SELECT seat FROM players WHERE id = ? AND room_id = ?');
    $pStmt->execute([$playerId, $roomId]);
    $mySeat = (int)$pStmt->fetchColumn();

    $tStmt = $db->prepare('SELECT * FROM table_state WHERE room_id = ?');
    $tStmt->execute([$roomId]);
    $table = $tStmt->fetch(PDO::FETCH_ASSOC);
    if (!$table) jsonResp(['error' => 'Kein Spiel']);

    if ((int)$table['current_defender'] !== $mySeat) jsonResp(['error' => 'Du bist nicht dran']);

    $attacks = json_decode($table['attack_json'], true);
    $defends = json_decode($table['defend_json'], true);

    // Verify attack card exists and not already defended
    if (!isset($attacks[$attackIdx])) jsonResp(['error' => 'Ungültiger Angriff']);
    foreach ($defends as $d) {
        if ((int)$d['attackIdx'] === $attackIdx) jsonResp(['error' => 'Bereits verteidigt']);
    }

    $atkCard = $attacks[$attackIdx];

    // Verify card can beat attack
    $rStmt = $db->prepare('SELECT trump_suit FROM rooms WHERE id = ?');
    $rStmt->execute([$roomId]);
    $trumpSuit = $rStmt->fetchColumn();

    $canBeat = false;
    if ($card['suit'] === $atkCard['suit'] && $card['value'] > $atkCard['value']) $canBeat = true;
    if ($card['suit'] === $trumpSuit && $atkCard['suit'] !== $trumpSuit) $canBeat = true;
    if ($card['suit'] === $trumpSuit && $atkCard['suit'] === $trumpSuit && $card['value'] > $atkCard['value']) $canBeat = true;
    if (!$canBeat) jsonResp(['error' => 'Karte kann nicht schlagen']);

    // Remove from hand
    $hStmt = $db->prepare('SELECT hand_json FROM players WHERE id = ? AND room_id = ?');
    $hStmt->execute([$playerId, $roomId]);
    $hand = json_decode($hStmt->fetchColumn(), true);
    $found = false;
    foreach ($hand as $i => $c) {
        if ($c['rank'] === $card['rank'] && $c['suit'] === $card['suit']) {
            array_splice($hand, $i, 1);
            $found = true;
            break;
        }
    }
    if (!$found) jsonResp(['error' => 'Karte nicht in der Hand']);
    $db->prepare('UPDATE players SET hand_json = ? WHERE id = ?')->execute([json_encode($hand), $playerId]);

    // Add defend
    $defends[] = ['rank' => $card['rank'], 'suit' => $card['suit'], 'value' => $card['value'], 'attackIdx' => $attackIdx];
    $db->prepare('UPDATE table_state SET defend_json = ?, last_action = ? WHERE room_id = ?')
       ->execute([json_encode($defends), "Spieler " . ($mySeat+1) . " verteidigt", $roomId]);

    // Check if all attacks beaten
    $unbeaten = count($attacks) - count($defends);
    if ($unbeaten === 0) {
        // All beaten — see if attacker can add more or bout ends
        resolveIfComplete($db, $roomId);
    }

    addEvent($db, $roomId, 'defend', ['seat' => $mySeat, 'card' => $card, 'attackIdx' => $attackIdx]);

    $state = getFullState($db, $roomId, $playerId);
    jsonResp($state);
}

function doTake() {
    $db = getDb();
    $roomId = trim($_POST['room_id'] ?? '');
    $playerId = (int)($_POST['player_id'] ?? 0);

    $pStmt = $db->prepare('SELECT seat FROM players WHERE id = ? AND room_id = ?');
    $pStmt->execute([$playerId, $roomId]);
    $mySeat = (int)$pStmt->fetchColumn();

    $tStmt = $db->prepare('SELECT * FROM table_state WHERE room_id = ?');
    $tStmt->execute([$roomId]);
    $table = $tStmt->fetch(PDO::FETCH_ASSOC);
    if ((int)$table['current_defender'] !== $mySeat) jsonResp(['error' => 'Du bist nicht der Verteidiger']);

    $attacks = json_decode($table['attack_json'], true);
    $defends = json_decode($table['defend_json'], true);

    // Give all table cards to defender
    $allCards = array_merge(
        array_map(function($a) { return ['rank'=>$a['rank'],'suit'=>$a['suit'],'value'=>$a['value']]; }, $attacks),
        array_map(function($d) { return ['rank'=>$d['rank'],'suit'=>$d['suit'],'value'=>$d['value']]; }, $defends)
    );

    $hStmt = $db->prepare('SELECT hand_json FROM players WHERE id = ? AND room_id = ?');
    $hStmt->execute([$playerId, $roomId]);
    $hand = json_decode($hStmt->fetchColumn(), true);
    $hand = array_merge($hand, $allCards);
    $db->prepare('UPDATE players SET hand_json = ? WHERE id = ?')->execute([json_encode($hand), $playerId]);

    // Next attacker = player after defender
    $numP = getNumPlayers($db, $roomId);
    $nextAttacker = ((int)$table['current_defender'] + 1) % $numP;
    $nextDefender = ($nextAttacker + 1) % $numP;

    // Draw cards
    drawUpAll($db, $roomId, $nextAttacker);

    // Check game over
    $gameOver = checkGameOver($db, $roomId);

    if ($gameOver) {
        finishGame($db, $roomId, $gameOver);
    } else {
        $db->prepare('UPDATE table_state SET attack_json = "[]", defend_json = "[]", current_attacker = ?, current_defender = ?, phase = "attack", last_action = ? WHERE room_id = ?')
           ->execute([$nextAttacker, $nextDefender, "Spieler " . ($mySeat+1) . " nimmt auf", $roomId]);
        incrementRound($db, $roomId);
    }

    addEvent($db, $roomId, 'take', ['seat' => $mySeat]);

    $state = getFullState($db, $roomId, $playerId);
    jsonResp($state);
}

function doPass() {
    $db = getDb();
    $roomId = trim($_POST['room_id'] ?? '');
    $playerId = (int)($_POST['player_id'] ?? 0);

    $pStmt = $db->prepare('SELECT seat FROM players WHERE id = ? AND room_id = ?');
    $pStmt->execute([$playerId, $roomId]);
    $mySeat = (int)$pStmt->fetchColumn();

    $tStmt = $db->prepare('SELECT * FROM table_state WHERE room_id = ?');
    $tStmt->execute([$roomId]);
    $table = $tStmt->fetch(PDO::FETCH_ASSOC);

    if ((int)$table['current_attacker'] !== $mySeat) jsonResp(['error' => 'Nur der Angreifer kann passen']);

    // If all attacks are beaten, defender wins the bout
    $attacks = json_decode($table['attack_json'], true);
    $defends = json_decode($table['defend_json'], true);

    if (count($attacks) === count($defends) && count($defends) > 0) {
        defenderWinsBout($db, $roomId);
    } else if (count($attacks) === 0) {
        jsonResp(['error' => 'Du musst eine Karte spielen']);
    } else {
        jsonResp(['error' => 'Noch ungeschlagene Angriffe']);
    }

    addEvent($db, $roomId, 'pass', ['seat' => $mySeat]);

    $state = getFullState($db, $roomId, $playerId);
    jsonResp($state);
}

function doTransfer() {
    $db = getDb();
    $roomId = trim($_POST['room_id'] ?? '');
    $playerId = (int)($_POST['player_id'] ?? 0);
    $card = json_decode($_POST['card'] ?? 'null', true);

    $rStmt = $db->prepare('SELECT with_transfer FROM rooms WHERE id = ?');
    $rStmt->execute([$roomId]);
    if (!(int)$rStmt->fetchColumn()) jsonResp(['error' => 'Transfer nicht aktiv']);

    $pStmt = $db->prepare('SELECT seat FROM players WHERE id = ? AND room_id = ?');
    $pStmt->execute([$playerId, $roomId]);
    $mySeat = (int)$pStmt->fetchColumn();

    $tStmt = $db->prepare('SELECT * FROM table_state WHERE room_id = ?');
    $tStmt->execute([$roomId]);
    $table = $tStmt->fetch(PDO::FETCH_ASSOC);

    if ((int)$table['current_defender'] !== $mySeat) jsonResp(['error' => 'Du bist nicht der Verteidiger']);

    $attacks = json_decode($table['attack_json'], true);
    if (count($attacks) !== 1) jsonResp(['error' => 'Transfer nur bei einem Angriff']);

    // Card must match rank of attack card
    if ($card['rank'] !== $attacks[0]['rank']) jsonResp(['error' => 'Karte muss gleichen Rang haben']);

    // Remove from hand
    $hStmt = $db->prepare('SELECT hand_json FROM players WHERE id = ? AND room_id = ?');
    $hStmt->execute([$playerId, $roomId]);
    $hand = json_decode($hStmt->fetchColumn(), true);
    $found = false;
    foreach ($hand as $i => $c) {
        if ($c['rank'] === $card['rank'] && $c['suit'] === $card['suit']) {
            array_splice($hand, $i, 1);
            $found = true;
            break;
        }
    }
    if (!$found) jsonResp(['error' => 'Karte nicht in der Hand']);
    $db->prepare('UPDATE players SET hand_json = ? WHERE id = ?')->execute([json_encode($hand), $playerId]);

    // Add as new attack, shift defender to next player
    $attacks[] = ['rank' => $card['rank'], 'suit' => $card['suit'], 'value' => $card['value'], 'attacker' => $mySeat];
    $numP = getNumPlayers($db, $roomId);
    $newDefender = ($mySeat + 1) % $numP;

    $db->prepare('UPDATE table_state SET attack_json = ?, current_attacker = ?, current_defender = ?, phase = "defend", last_action = ? WHERE room_id = ?')
       ->execute([json_encode($attacks), $mySeat, $newDefender, "Spieler " . ($mySeat+1) . " transferiert!", $roomId]);

    addEvent($db, $roomId, 'transfer', ['seat' => $mySeat, 'card' => $card]);

    $state = getFullState($db, $roomId, $playerId);
    jsonResp($state);
}

function doList() {
    $db = getDb();
    $stmt = $db->query('SELECT r.id, r.host_name, r.num_players, r.with_transfer, r.status, r.created_at, COUNT(p.id) as player_count FROM rooms r LEFT JOIN players p ON r.id = p.room_id GROUP BY r.id ORDER BY r.created_at DESC LIMIT 20');
    $rooms = $stmt->fetchAll(PDO::FETCH_ASSOC);
    jsonResp(['rooms' => $rooms]);
}

function doCleanup() {
    $db = getDb();
    // Remove rooms older than 2 hours
    $db->prepare('DELETE FROM events WHERE room_id IN (SELECT id FROM rooms WHERE updated_at < ?)')
       ->execute([time() - 7200]);
    $db->prepare('DELETE FROM players WHERE room_id IN (SELECT id FROM rooms WHERE updated_at < ?)')
       ->execute([time() - 7200]);
    $db->prepare('DELETE FROM table_state WHERE room_id IN (SELECT id FROM rooms WHERE updated_at < ?)')
       ->execute([time() - 7200]);
    $db->prepare('DELETE FROM rooms WHERE updated_at < ?')
       ->execute([time() - 7200]);
    jsonResp(['cleaned' => true]);
}

// ========== INTERNAL ==========

function getNumPlayers($db, $roomId) {
    $s = $db->prepare('SELECT COUNT(*) FROM players WHERE room_id = ?');
    $s->execute([$roomId]);
    return (int)$s->fetchColumn();
}

function drawUpAll($db, $roomId, $nextAttacker) {
    // Get deck
    $rStmt = $db->prepare('SELECT deck_json FROM rooms WHERE id = ?');
    $rStmt->execute([$roomId]);
    $deck = json_decode($rStmt->fetchColumn(), true);
    if (empty($deck)) return;

    $numP = getNumPlayers($db, $roomId);
    $pStmt = $db->prepare('SELECT id, seat, hand_json FROM players WHERE room_id = ? ORDER BY seat');
    $pStmt->execute([$roomId]);
    $players = $pStmt->fetchAll(PDO::FETCH_ASSOC);

    // Draw order: attacker first, then clockwise (skip defender), then defender
    $drawOrder = [];
    for ($i = 0; $i < $numP; $i++) {
        $idx = ($nextAttacker + $i) % $numP;
        $drawOrder[] = $idx;
    }

    foreach ($drawOrder as $idx) {
        if (!isset($players[$idx])) continue;
        $hand = json_decode($players[$idx]['hand_json'], true);
        while (count($hand) < 6 && !empty($deck)) {
            $hand[] = array_pop($deck);
        }
        $db->prepare('UPDATE players SET hand_json = ? WHERE id = ?')
           ->execute([json_encode($hand), $players[$idx]['id']]);
    }

    $db->prepare('UPDATE rooms SET deck_json = ? WHERE id = ?')
       ->execute([json_encode($deck), $roomId]);
}

function defenderWinsBout($db, $roomId) {
    $tStmt = $db->prepare('SELECT * FROM table_state WHERE room_id = ?');
    $tStmt->execute([$roomId]);
    $table = $tStmt->fetch(PDO::FETCH_ASSOC);

    $defender = (int)$table['current_defender'];
    $numP = getNumPlayers($db, $roomId);

    // Clear table
    drawUpAll($db, $roomId, $defender);

    $nextAttacker = $defender;
    $nextDefender = ($defender + 1) % $numP;

    $gameOver = checkGameOver($db, $roomId);

    if ($gameOver) {
        finishGame($db, $roomId, $gameOver);
    } else {
        $db->prepare('UPDATE table_state SET attack_json = "[]", defend_json = "[]", current_attacker = ?, current_defender = ?, phase = "attack", last_action = ? WHERE room_id = ?')
           ->execute([$nextAttacker, $nextDefender, "Verteidiger gewinnt!", $roomId]);
        incrementRound($db, $roomId);
    }
}

function resolveIfComplete($db, $roomId) {
    $tStmt = $db->prepare('SELECT * FROM table_state WHERE room_id = ?');
    $tStmt->execute([$roomId]);
    $table = $tStmt->fetch(PDO::FETCH_ASSOC);

    $attacks = json_decode($table['attack_json'], true);
    $defends = json_decode($table['defend_json'], true);

    // All beaten?
    if (count($attacks) === count($defends)) {
        // Check max attacks or if attacker has no matching cards
        if (count($attacks) >= 6) {
            defenderWinsBout($db, $roomId);
            return;
        }
        // Set phase to addAttack so attacker can add more
        $db->prepare('UPDATE table_state SET phase = "addAttack", last_action = ? WHERE room_id = ?')
           ->execute(["Alle geschlagen — noch eine Karte?", $roomId]);
    }
}

function checkGameOver($db, $roomId) {
    $rStmt = $db->prepare('SELECT deck_json FROM rooms WHERE id = ?');
    $rStmt->execute([$roomId]);
    $deck = json_decode($rStmt->fetchColumn(), true);

    if (!empty($deck)) return false; // Still drawing

    $pStmt = $db->prepare('SELECT seat, hand_json FROM players WHERE room_id = ? ORDER BY seat');
    $pStmt->execute([$roomId]);
    $players = $pStmt->fetchAll(PDO::FETCH_ASSOC);

    $playersWithCards = [];
    foreach ($players as $p) {
        $hand = json_decode($p['hand_json'], true);
        if (!empty($hand)) {
            $playersWithCards[] = (int)$p['seat'];
        }
    }

    if (count($playersWithCards) <= 1) {
        return $playersWithCards[0] ?? -1;
    }
    return false;
}

function finishGame($db, $roomId, $durakSeat) {
    $db->prepare('UPDATE rooms SET status = "finished" WHERE id = ?')->execute([$roomId]);
    $db->prepare('UPDATE table_state SET phase = "gameOver", last_action = ? WHERE room_id = ?')
       ->execute([$durakSeat >= 0 ? "Spieler " . ($durakSeat+1) . " ist der Durak!" : "Unentschieden!", $roomId]);
    addEvent($db, $roomId, 'game_over', ['durak' => $durakSeat]);
}

function incrementRound($db, $roomId) {
    $db->prepare('UPDATE table_state SET round_num = round_num + 1 WHERE room_id = ?')->execute([$roomId]);
}