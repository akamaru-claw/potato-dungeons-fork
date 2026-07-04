<?php
// Contact form handler for TR-Trade using PHPMailer + united-domains SMTP
require 'PHPMailer/PHPMailer.php';
require 'PHPMailer/SMTP.php';
require 'PHPMailer/Exception.php';

if (file_exists('mail_config.local.php')) {
    require 'mail_config.local.php';
} else {
    http_response_code(500);
    echo "error\nMail-Konfiguration fehlt.";
    exit;
}

use PHPMailer\PHPMailer\PHPMailer;
use PHPMailer\PHPMailer\Exception as MailerException;

$errors = [];
$success = false;

if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    $name    = isset($_POST['name'])    ? trim($_POST['name'])    : '';
    $email   = isset($_POST['email'])   ? trim($_POST['email'])   : '';
    $subject = isset($_POST['subject']) ? trim($_POST['subject']) : '';
    $message = isset($_POST['message']) ? trim($_POST['message']) : '';
    $type    = isset($_POST['type'])     ? trim($_POST['type'])     : 'General';

    if (empty($name))      $errors[] = 'Bitte Namen eingeben.';
    if (empty($email) || !filter_var($email, FILTER_VALIDATE_EMAIL)) $errors[] = 'Bitte gültige E-Mail eingeben.';
    if (empty($subject))   $errors[] = 'Bitte Betreff eingeben.';
    if (empty($message))   $errors[] = 'Bitte Nachricht eingeben.';
    if (!empty($_POST['website'])) $errors[] = 'Spam erkannt.';

    if (empty($errors)) {
        $mail = new PHPMailer(true);
        try {
            $mail->isSMTP();
            $mail->Host       = $mail_host;
            $mail->SMTPAuth   = true;
            $mail->Username   = $mail_user;
            $mail->Password   = $mail_pass;
            $mail->SMTPSecure = PHPMailer::ENCRYPTION_SMTPS;
            $mail->Port       = $mail_port;
            $mail->CharSet    = 'UTF-8';

            $mail->setFrom($mail_user, 'TR-Trade Website');
            $mail->addReplyTo($email, $name);
            $mail->addAddress('info@tr-trade.de');
            // E-Mail-Kopie an Absender als Bestätigung, falls erwünscht
            // $mail->addBCC('backup@tr-trade.de');

            $mail->Subject = 'Kontaktanfrage: ' . $subject;
            $mail->Body    = "Anfrage über tr-trade.de Kontaktformular\n\n"
                           . "Name: $name\n"
                           . "E-Mail: $email\n"
                           . "Anfrage-Typ: $type\n"
                           . "Betreff: $subject\n\n"
                           . "Nachricht:\n$message\n";

            $mail->send();
            $success = true;
        } catch (MailerException $e) {
            $errors[] = 'Mailer-Fehler: ' . $mail->ErrorInfo;
        }
    }
}

header('Content-Type: text/plain; charset=UTF-8');
if (!empty($errors)) {
    http_response_code(400);
    echo "error\n" . implode("\n", $errors);
} elseif ($success) {
    echo "success";
} else {
    http_response_code(500);
    echo "error\nMail konnte nicht versendet werden.";
}
// v4: mail_config.local.php wird NICHT in Git committet.
?>
