<?php
// DEV/TEST ONLY — configures a local Moodle (docker-compose.moodle.yml) for HandsOnEdu:
// LTI 1.3 tool (keyset, deep linking, AGS, NRPS, new window), a course, a teacher and
// two students. Prints the platform data HandsOnEdu needs as JSON.
// Run through scripts/moodle-dev-setup.sh (as the web server user).

define('CLI_SCRIPT', true);
require('/bitnami/moodle/config.php');
require_once($CFG->dirroot . '/mod/lti/locallib.php');
require_once($CFG->dirroot . '/course/lib.php');
require_once($CFG->dirroot . '/user/lib.php');
require_once($CFG->libdir . '/enrollib.php');

$tool = rtrim(getenv('HOE_URL') ?: 'http://handsonedu.localtest.me:9876', '/');
$toolname = 'HandsOnEdu — Aula de Señas';
\core\session\manager::set_user(get_admin());

// The tool lives on a private address/port in this test setup: let Moodle call it.
set_config('curlsecurityblockedhosts', '');
set_config('curlsecurityallowedport', '');

// ── LTI 1.3 tool ────────────────────────────────────────────────────────────
$type = $DB->get_record('lti_types', ['name' => $toolname]);
if (!$type) {
    $t = new stdClass();
    $t->state = LTI_TOOL_STATE_CONFIGURED;
    $c = new stdClass();
    $c->lti_typename = $toolname;
    $c->lti_description = 'Enseñanza de lengua de señas con reconocimiento de manos en el navegador.';
    $c->lti_toolurl = $tool . '/lti/launch';
    $c->lti_ltiversion = LTI_VERSION_1P3;
    $c->lti_keytype = LTI_JWK_KEYSET;
    $c->lti_publickeyset = $tool . '/lti/jwks';
    $c->lti_initiatelogin = $tool . '/lti/login';
    $c->lti_redirectionuris = $tool . '/lti/launch';
    $c->lti_contentitem = 1;
    $c->lti_toolurl_ContentItemSelectionRequest = $tool . '/lti/launch';
    $c->lti_coursevisible = LTI_COURSEVISIBLE_ACTIVITYCHOOSER;
    $c->lti_launchcontainer = LTI_LAUNCH_CONTAINER_WINDOW;
    $c->lti_sendname = LTI_SETTING_ALWAYS;
    $c->lti_sendemailaddr = LTI_SETTING_NEVER;
    $c->lti_acceptgrades = LTI_SETTING_ALWAYS;
    $c->lti_forcessl = 0;
    $c->ltiservice_gradesynchronization = 2;   // AGS: grade sync + column management
    $c->ltiservice_memberships = 1;            // NRPS: course roster
    $typeid = lti_add_type($t, $c);
    $type = $DB->get_record('lti_types', ['id' => $typeid]);
}

// ── Course, users, enrolments ───────────────────────────────────────────────
$course = $DB->get_record('course', ['shortname' => 'LSEC1']);
if (!$course) {
    $course = create_course((object) [
        'fullname' => 'Lengua de Señas Ecuatoriana I', 'shortname' => 'LSEC1',
        'category' => $DB->get_field_sql('SELECT MIN(id) FROM {course_categories}'),
        'summary' => 'Curso de prueba de la integración HandsOnEdu (LTI 1.3).',
    ]);
}
$users = [
    ['docente', 'Docente123!', 'Luis', 'Andrade', 'editingteacher'],
    ['estudiante', 'Estudiante123!', 'Ana', 'Quishpe', 'student'],
    ['estudiante2', 'Estudiante123!', 'Carlos', 'Tenesaca', 'student'],
];
$mnethostid = (int) ($CFG->mnethostid ?? 0) ?: (int) $DB->get_field('mnet_host', 'id', ['wwwroot' => $CFG->wwwroot]) ?: 1;
$manual = enrol_get_plugin('manual');
$instance = $DB->get_record('enrol', ['courseid' => $course->id, 'enrol' => 'manual'], '*', MUST_EXIST);
foreach ($users as [$username, $password, $first, $last, $role]) {
    $user = $DB->get_record('user', ['username' => $username, 'mnethostid' => $mnethostid]);
    if (!$user) {
        $id = user_create_user((object) [
            'username' => $username, 'password' => $password, 'firstname' => $first, 'lastname' => $last,
            'email' => $username . '@example.com', 'auth' => 'manual', 'confirmed' => 1,
            'mnethostid' => $mnethostid, 'lang' => 'es',
        ]);
        $user = $DB->get_record('user', ['id' => $id]);
    }
    update_internal_user_password($user, $password);   // also resets it on re-runs
    $roleid = $DB->get_field('role', 'id', ['shortname' => $role], MUST_EXIST);
    $manual->enrol_user($instance, $user->id, $roleid);
}

echo json_encode([
    'name' => 'Moodle local de prueba',
    'issuer' => $CFG->wwwroot,
    'client_id' => $type->clientid,
    'deployment_ids' => [(string) $type->id],
    'auth_login_url' => $CFG->wwwroot . '/mod/lti/auth.php',
    'auth_token_url' => $CFG->wwwroot . '/mod/lti/token.php',
    'jwks_url' => $CFG->wwwroot . '/mod/lti/certs.php',
    'course_id' => (int) $course->id,
    'type_id' => (int) $type->id,
], JSON_UNESCAPED_SLASHES) . PHP_EOL;
