<?php
// Potato Dungeons — Highscore API
// Stores scores in a JSON file (server-side)

header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: no-cache, no-store');

$DATA_FILE = __DIR__ . '/highscores.json';
$MAX_SCORES = 100;

function readScores($file) {
  if (!file_exists($file)) return [];
  $data = file_get_contents($file);
  return json_decode($data, true) ?: [];
}

function writeScores($file, $scores) {
  file_put_contents($file, json_encode($scores, JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE));
}

// POST: Save new score
if ($_SERVER['REQUEST_METHOD'] === 'POST') {
  $input = json_decode(file_get_contents('php://input'), true);
  if (!$input || !isset($input['name']) || !isset($input['floor']) || !isset($input['kills'])) {
    http_response_code(400);
    echo json_encode(['error' => 'Missing fields']);
    exit;
  }

  $name = trim(substr($input['name'], 0, 20));
  $floor = intval($input['floor']);
  $kills = intval($input['kills']);
  $weapons = intval($input['weapons'] ?? 0);
  $mode = in_array($input['mode'] ?? '', ['solo', 'coop']) ? $input['mode'] : 'solo';

  if (empty($name)) {
    http_response_code(400);
    echo json_encode(['error' => 'Empty name']);
    exit;
  }

  $scores = readScores($DATA_FILE);

  $entry = [
    'name' => $name,
    'floor' => $floor,
    'kills' => $kills,
    'weapons' => $weapons,
    'mode' => $mode,
    'date' => date('Y-m-d H:i'),
  ];

  $scores[] = $entry;

  // Sort by floor desc, then kills desc
  usort($scores, function($a, $b) {
    if ($a['floor'] !== $b['floor']) return $b['floor'] - $a['floor'];
    return $b['kills'] - $a['kills'];
  });

  // Keep top scores
  $scores = array_slice($scores, 0, $MAX_SCORES);

  writeScores($DATA_FILE, $scores);

  echo json_encode(['ok' => true, 'rank' => array_search($entry, $scores) + 1]);
  exit;
}

// GET: Retrieve scores
$scores = readScores($DATA_FILE);
$limit = isset($_GET['limit']) ? min(intval($_GET['limit']), 50) : 50;
echo json_encode(array_slice($scores, 0, $limit));