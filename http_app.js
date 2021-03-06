/**
 * Copyright (c) 2018, OCEAN
 * All rights reserved.
 * Redistribution and use in source and binary forms, with or without modification, are permitted provided that the following conditions are met:
 * 1. Redistributions of source code must retain the above copyright notice, this list of conditions and the following disclaimer.
 * 2. Redistributions in binary form must reproduce the above copyright notice, this list of conditions and the following disclaimer in the documentation and/or other materials provided with the distribution.
 * 3. The name of the author may not be used to endorse or promote products derived from this software without specific prior written permission.
 * THIS SOFTWARE IS PROVIDED BY THE AUTHOR ``AS IS'' AND ANY EXPRESS OR IMPLIED WARRANTIES, INCLUDING, BUT NOT LIMITED TO, THE IMPLIED WARRANTIES OF MERCHANTABILITY AND FITNESS FOR A PARTICULAR PURPOSE ARE DISCLAIMED. IN NO EVENT SHALL THE AUTHOR BE LIABLE FOR ANY DIRECT, INDIRECT, INCIDENTAL, SPECIAL, EXEMPLARY, OR CONSEQUENTIAL DAMAGES (INCLUDING, BUT NOT LIMITED TO, PROCUREMENT OF SUBSTITUTE GOODS OR SERVICES; LOSS OF USE, DATA, OR PROFITS; OR BUSINESS INTERRUPTION) HOWEVER CAUSED AND ON ANY THEORY OF LIABILITY, WHETHER IN CONTRACT, STRICT LIABILITY, OR TORT (INCLUDING NEGLIGENCE OR OTHERWISE) ARISING IN ANY WAY OUT OF THE USE OF THIS SOFTWARE, EVEN IF ADVISED OF THE POSSIBILITY OF SUCH DAMAGE.
 */

/**
 * Created by ryeubi on 2015-08-31.
 */

var http = require('http');
var express = require('express');
var fs = require('fs');
var mqtt = require('mqtt');
var util = require('util');
var url = require('url');
var ip = require('ip');
var shortid = require('shortid');
var moment = require('moment');

global.sh_adn = require('./http_adn');
var noti = require('./noti');

var HTTP_SUBSCRIPTION_ENABLE = 0;
var MQTT_SUBSCRIPTION_ENABLE = 0;

global.my_data_name = '';
global.dry_loadcell = '';
global.my_parent_cnt_name = '';
global.my_cnt_name = '';
global.pre_my_cnt_name = '';
global.my_mission_parent = '';
global.my_mission_name = '';
global.zero_parent_mission_name = '';
global.zero_mission_name = '';
global.my_sortie_name = 'disarm';
// global.my_drone_type = 'pixhawk';
global.my_secure = 'off';

const first_interval = 3000;
const retry_interval = 2500;
const normal_interval = 100;
var data_interval = 10000;
const display_interval = 1000;

const always_interval = 30000;
const always_period_tick = parseInt((3 * 60 * 1000) / always_interval);

const debug_pin = 12;
const operation_pin = 18;
const start_btn_pin = 13;
const solenoid_pin = 14;
const fan_pin = 15;
const input_door_pin = 16;
const output_door_pin = 17;
const safe_door_pin = 18;
const heater1_pin = 19;
const heater2_pin = 20;
const heater3_pin = 21;
const stirrer_pin = 22;

const TURN_ON = 0;
const TURN_OFF = 1;
const TURN_BACK = -1;

var app = express();

//app.use(bodyParser.urlencoded({ extended: true }));
//app.use(bodyParser.json());
//app.use(bodyParser.json({ type: 'application/*+json' }));
//app.use(bodyParser.text({ type: 'application/*+xml' }));

var dryer_event = 0x00;

const EVENT_INPUT_DOOR_OPEN = 0x01;
const EVENT_INPUT_DOOR_CLOSE = 0x02;
const EVENT_OUTPUT_DOOR_OPEN = 0x04;
const EVENT_OUTPUT_DOOR_CLOSE = 0x08;
const EVENT_SAFE_DOOR_OPEN = 0x10;
const EVENT_SAFE_DOOR_CLOSE = 0x20;
const EVENT_START_BUTTON = 0x40;
const EVENT_START_BTN_LONG = 0x80;

var dryer_event_2 = 0x00;

const EVENT_HEAT_COMPLETE = 0x01;
const EVENT_EXHAUST_COMPLETE = 0x04;
const EVENT_END_ACTION = 0x08;
const EVENT_DEBUG_BUTTON_RELEASE = 0x10;
const EVENT_DEBUG_BUTTON_PRESS = 0x20;

// var tas_dryer = spawn('python3', ['./exec.py']);
// tas_dryer.stdout.on('data', function(data) {
// console.log('stdout: ' + data);
// });
// tas_dryer.on('exit', function(code) {
// console.log('exit: ' + code);
// });
// tas_dryer.on('error', function(code) {
// console.log('error: ' + code);
// });

// ?????? ????????.
var server = null;
var noti_topic = '';

// ready for mqtt
for(var i = 0; i < conf.sub.length; i++) {
    if(conf.sub[i].name != null) {
        if(url.parse(conf.sub[i].nu).protocol === 'http:') {
            HTTP_SUBSCRIPTION_ENABLE = 1;
            if(url.parse(conf.sub[i]['nu']).hostname === 'autoset') {
                conf.sub[i]['nu'] = 'http://' + ip.address() + ':' + conf.ae.port + url.parse(conf.sub[i]['nu']).pathname;
            }
        }
        else if(url.parse(conf.sub[i].nu).protocol === 'mqtt:') {
            MQTT_SUBSCRIPTION_ENABLE = 1;
        }
        else {
            //console.log('notification uri of subscription is not supported');
            //process.exit();
        }
    }
}

var return_count = 0;
var request_count = 0;

function ready_for_notification() {
    if(HTTP_SUBSCRIPTION_ENABLE == 1) {
        server = http.createServer(app);
        server.listen(conf.ae.port, function () {
            console.log('http_server running at ' + conf.ae.port + ' port');
        });
    }

    if(MQTT_SUBSCRIPTION_ENABLE == 1) {
        for(var i = 0; i < conf.sub.length; i++) {
            if (conf.sub[i].name != null) {
                if (url.parse(conf.sub[i].nu).protocol === 'mqtt:') {
                    if (url.parse(conf.sub[i]['nu']).hostname === 'autoset') {
                        conf.sub[i]['nu'] = 'mqtt://' + conf.cse.host + '/' + conf.ae.id;
                        noti_topic = util.format('/oneM2M/req/+/%s/#', conf.ae.id);
                    }
                    else if (url.parse(conf.sub[i]['nu']).hostname === conf.cse.host) {
                        noti_topic = util.format('/oneM2M/req/+/%s/#', conf.ae.id);
                    }
                    else {
                        noti_topic = util.format('%s', url.parse(conf.sub[i].nu).pathname);
                    }
                }
            }
        }
        //mqtt_connect(conf.cse.host, noti_topic);
    }
}

function ae_response_action(status, res_body, callback) {
    var aeid = res_body['m2m:ae']['aei'];
    conf.ae.id = aeid;
    callback(status, aeid);
}

function create_cnt_all(count, callback) {
    if(conf.cnt.length == 0) {
        callback(2001, count);
    }
    else {
        if(conf.cnt.hasOwnProperty(count)) {
            var parent = conf.cnt[count].parent;
            var rn = conf.cnt[count].name;
            sh_adn.crtct(parent, rn, count, function (rsc, res_body, count) {
                if (rsc == 5106 || rsc == 2001 || rsc == 4105) {
                    create_cnt_all(++count, function (status, count) {
                        callback(status, count);
                    });
                }
                else {
                    callback(9999, count);
                }
            });
        }
        else {
            callback(2001, count);
        }
    }
}

function delete_sub_all(count, callback) {
    if(conf.sub.length == 0) {
        callback(2001, count);
    }
    else {
        if(conf.sub.hasOwnProperty(count)) {
            var target = conf.sub[count].parent + '/' + conf.sub[count].name;
            sh_adn.delsub(target, count, function (rsc, res_body, count) {
                if (rsc == 5106 || rsc == 2002 || rsc == 2000 || rsc == 4105 || rsc == 4004) {
                    delete_sub_all(++count, function (status, count) {
                        callback(status, count);
                    });
                }
                else {
                    callback(9999, count);
                }
            });
        }
        else {
            callback(2001, count);
        }
    }
}

function create_sub_all(count, callback) {
    if(conf.sub.length == 0) {
        callback(2001, count);
    }
    else {
        if(conf.sub.hasOwnProperty(count)) {
            var parent = conf.sub[count].parent;
            var rn = conf.sub[count].name;
            var nu = conf.sub[count].nu;
            sh_adn.crtsub(parent, rn, nu, count, function (rsc, res_body, count) {
                if (rsc == 5106 || rsc == 2001 || rsc == 4105) {
                    create_sub_all(++count, function (status, count) {
                        callback(status, count);
                    });
                }
                else {
                    callback('9999', count);
                }
            });
        }
        else {
            callback(2001, count);
        }
    }
}

var dry_info = {};

function retrieve_my_cnt_name(callback) {
    sh_adn.rtvct('/Mobius/DRY/approval/'+conf.ae.name+'/la', 0, function (rsc, res_body, count) {
        if(rsc == 2000) {
            dry_info = res_body[Object.keys(res_body)[0]].con;
            // // console.log(drone_info);

            conf.cnt = [];
            var info = {};
            info.parent = '/Mobius/' + dry_info.space;// /Mobius/KETI_DRY
            info.name = 'Dry_Data';
            conf.cnt.push(JSON.parse(JSON.stringify(info)));

            info.parent = '/Mobius/' + dry_info.space + '/Dry_Data';// /Mobius/KETI_DRY/Dry_Data
            info.name = dry_info.dry;
            conf.cnt.push(JSON.parse(JSON.stringify(info)));

            info.parent = '/Mobius/' + dry_info.space + '/Dry_Data/' + dry_info.dry; // /Mobius/KETI_DRY/Dry_Data/keti
            info.name = my_sortie_name; // /Mobius/KETI_DRY/Dry_Data/keti/disarm
            conf.cnt.push(JSON.parse(JSON.stringify(info)));

            my_parent_cnt_name = info.parent; // /Mobius/KETI_DRY/Dry_Data/keti/
            my_cnt_name = my_parent_cnt_name + '/' + my_sortie_name; // /Mobius/KETI_DRY/Dry_Data/keti/

            info.parent = '/Mobius/' + dry_info.space;// /Mobius/KETI_DRY
            info.name = 'Zero_Data';
            conf.cnt.push(JSON.parse(JSON.stringify(info)));

            info.parent = '/Mobius/' + dry_info.space + '/Zero_Data';
            info.name = dry_info.dry;
            conf.cnt.push(JSON.parse(JSON.stringify(info)));

            // default mission
            info.parent = '/Mobius/' + dry_info.space + '/Zero_Data/' + dry_info.dry;
            info.name = 'Adjustment';
            conf.cnt.push(JSON.parse(JSON.stringify(info)));

            zero_parent_mission_name = info.parent + '/' + info.name;
            zero_mission_name = zero_parent_mission_name + '/' + my_sortie_name;

            info.parent = zero_parent_mission_name;
            info.name = my_sortie_name;
            conf.cnt.push(JSON.parse(JSON.stringify(info)));

            if(dry_info.hasOwnProperty('loadcell_factor')) {
                dry_data_block.loadcell_factor = parseFloat(parseFloat(dry_info.loadcell_factor.toString()).toFixed(1));
            }

            if(dry_info.hasOwnProperty('cum_ref_weight')) {
                dry_data_block.cum_ref_weight = parseFloat(parseFloat(dry_info.cum_ref_weight.toString()).toFixed(1));
            }

            if(dry_info.hasOwnProperty('loadcell_ref_weight')) {
                dry_data_block.loadcell_ref_weight = parseFloat(parseFloat(dry_info.loadcell_ref_weight.toString()).toFixed(1));
            }

            if(dry_info.hasOwnProperty('ref_external_temp')) {
                dry_data_block.ref_external_temp = parseFloat(parseFloat(dry_info.ref_external_temp.toString()).toFixed(1));
            }

            if(dry_info.hasOwnProperty('ref_internal_temp')) {
                dry_data_block.ref_internal_temp = parseFloat(parseFloat(dry_info.ref_internal_temp.toString()).toFixed(1));
            }

            if(dry_info.hasOwnProperty('ref_elapsed_time')) {
                dry_data_block.ref_elapsed_time = parseFloat(parseFloat(dry_info.ref_elapsed_time.toString()).toFixed(1));
            }

            MQTT_SUBSCRIPTION_ENABLE = 1;
            sh_state = 'crtct';
            setTimeout(http_watchdog, normal_interval);
            callback();
        }
        else {
            console.log('x-m2m-rsc : ' + rsc + ' <----' + res_body);
            setTimeout(http_watchdog, retry_interval);
            callback();
        }
    });
}

setTimeout(http_watchdog, normal_interval);
function http_watchdog() {
    if (sh_state === 'crtae') {
        console.log('[sh_state] : ' + sh_state);
        sh_adn.crtae(conf.ae.parent, conf.ae.name, conf.ae.appid, function (status, res_body) {
            console.log(res_body);
            if (status == 2001) {
                ae_response_action(status, res_body, function (status, aeid) {
                    console.log('x-m2m-rsc : ' + status + ' - ' + aeid + ' <----');
                    sh_state = 'rtvae';
                    request_count = 0;
                    return_count = 0;

                    setTimeout(http_watchdog, normal_interval);
                });
            }
            else if (status == 5106 || status == 4105) {
                console.log('x-m2m-rsc : ' + status + ' <----');
                sh_state = 'rtvae';

                setTimeout(http_watchdog, normal_interval);
            }
            else {
                console.log('x-m2m-rsc : ' + status + ' <----');
                setTimeout(http_watchdog, retry_interval);
            }
        });
    }
    else if (sh_state === 'rtvae') {
        if (conf.ae.id === 'S') {
            conf.ae.id = 'S' + shortid.generate();
        }

        console.log('[sh_state] : ' + sh_state);
        sh_adn.rtvae(conf.ae.parent + '/' + conf.ae.name, function (status, res_body) {
            if (status == 2000) {
                var aeid = res_body['m2m:ae']['aei'];
                console.log('x-m2m-rsc : ' + status + ' - ' + aeid + ' <----');

                if(conf.ae.id != aeid && conf.ae.id != ('/'+aeid)) {
                    console.log('AE-ID created is ' + aeid + ' not equal to device AE-ID is ' + conf.ae.id);
                }
                else {
                    sh_state = 'rtvct';
                    request_count = 0;
                    return_count = 0;
                    setTimeout(http_watchdog, normal_interval);
                }
            }
            else {
                console.log('x-m2m-rsc : ' + status + ' <----');
                setTimeout(http_watchdog, retry_interval);
            }
        });
    }
    else if(sh_state === 'rtvct') {
        retrieve_my_cnt_name(function () {
        });
    }
    else if (sh_state === 'crtct') {
        console.log('[sh_state] : ' + sh_state);
        create_cnt_all(request_count, function (status, count) {
            if(status == 9999) {
                setTimeout(http_watchdog, retry_interval);
            }
            else {
                request_count = ++count;
                return_count = 0;
                if (conf.cnt.length <= count) {
                    sh_state = 'delsub';
                    request_count = 0;
                    return_count = 0;

                    setTimeout(http_watchdog, normal_interval);
                }
            }
        });
    }
    else if (sh_state === 'delsub') {
        console.log('[sh_state] : ' + sh_state);
        delete_sub_all(request_count, function (status, count) {
            if(status == 9999) {
                setTimeout(http_watchdog, retry_interval);
            }
            else {
                request_count = ++count;
                return_count = 0;
                if (conf.sub.length <= count) {
                    sh_state = 'crtsub';
                    request_count = 0;
                    return_count = 0;

                    setTimeout(http_watchdog, normal_interval);
                }
            }
        });
    }
    else if (sh_state === 'crtsub') {
        console.log('[sh_state] : ' + sh_state);
        create_sub_all(request_count, function (status, count) {
            if(status == 9999) {
                setTimeout(http_watchdog, retry_interval);
            }
            else {
                request_count = ++count;
                return_count = 0;
                if (conf.sub.length <= count) {
                    sh_state = 'crtci';

                    ready_for_notification();

                    setTimeout(http_watchdog, normal_interval);
                }
            }
        });
    }
    else if (sh_state === 'crtci') {
        send_to_Mobius(my_cnt_name, dry_data_block);

        if(dry_data_block.state == 'HEAT') {
            data_interval = 10000;
        }
        else {
            data_interval = 30000;
        }
        setTimeout(http_watchdog, data_interval);
    }
}

function send_to_Mobius(url, obj_content) {
    sh_adn.crtci(url+'?rcn=0', 0, obj_content, null, function () {
    });
}

// for notification
//var xmlParser = bodyParser.text({ type: '*/*' });

function mqtt_connect(serverip, noti_topic) {
    if(mqtt_client == null) {
        if (conf.usesecure === 'disable') {
            var connectOptions = {
                host: serverip,
                port: conf.cse.mqttport,
// username: 'keti',
// password: 'keti123',
                protocol: "mqtt",
                keepalive: 10,
// clientId: serverUID,
                protocolId: "MQTT",
                protocolVersion: 4,
                clean: true,
                reconnectPeriod: 2000,
                connectTimeout: 2000,
                rejectUnauthorized: false
            };
        }
        else {
            connectOptions = {
                host: serverip,
                port: conf.cse.mqttport,
                protocol: "mqtts",
                keepalive: 10,
// clientId: serverUID,
                protocolId: "MQTT",
                protocolVersion: 4,
                clean: true,
                reconnectPeriod: 2000,
                connectTimeout: 2000,
                key: fs.readFileSync("./server-key.pem"),
                cert: fs.readFileSync("./server-crt.pem"),
                rejectUnauthorized: false
            };
        }

        mqtt_client = mqtt.connect(connectOptions);
    }

    mqtt_client.on('connect', function () {
        console.log('mqtt connected to ' + serverip);
        for(var idx in noti_topic) {
            if(noti_topic.hasOwnProperty(idx)) {
                mqtt_client.subscribe(noti_topic[idx]);
                console.log('[mqtt_connect] noti_topic[' + idx + ']: ' + noti_topic[idx]);
            }
        }
    });

    mqtt_client.on('message', function (topic, message) {
        if(topic.includes('/oneM2M/req/')) {
            var jsonObj = JSON.parse(message.toString());

            if (jsonObj['m2m:rqp'] == null) {
                jsonObj['m2m:rqp'] = jsonObj;
            }

            noti.mqtt_noti_action(topic.split('/'), jsonObj);
        }
        else {
        }
    });

    mqtt_client.on('error', function (err) {
        console.log(err.message);
    });
}

///////////////////////////////////////////////////////////////////////////////

var dry_mqtt_client = null;
var dry_noti_topic = [];

dry_noti_topic.push('/res_zero_point');
dry_noti_topic.push('/res_calc_factor');
dry_noti_topic.push('/res_internal_temp');
dry_noti_topic.push('/res_input_door');
dry_noti_topic.push('/res_output_door');
dry_noti_topic.push('/res_safe_door');
dry_noti_topic.push('/res_weight');
dry_noti_topic.push('/res_operation_mode');
dry_noti_topic.push('/res_debug_mode');
dry_noti_topic.push('/res_start_btn');

function dry_mqtt_connect(broker_ip, port, noti_topic) {
    if(dry_mqtt_client == null) {
        if (conf.usesecure === 'disable') {
            var connectOptions = {
                host: broker_ip,
                port: port,
// username: 'keti',
// password: 'keti123',
                protocol: "mqtt",
                keepalive: 10,
// clientId: serverUID,
                protocolId: "MQTT",
                protocolVersion: 4,
                clean: true,
                reconnectPeriod: 2000,
                connectTimeout: 2000,
                rejectUnauthorized: false
            };
        }
        else {
            connectOptions = {
                host: broker_ip,
                port: port,
                protocol: "mqtts",
                keepalive: 10,
// clientId: serverUID,
                protocolId: "MQTT",
                protocolVersion: 4,
                clean: true,
                reconnectPeriod: 2000,
                connectTimeout: 2000,
                key: fs.readFileSync("./server-key.pem"),
                cert: fs.readFileSync("./server-crt.pem"),
                rejectUnauthorized: false
            };
        }

        dry_mqtt_client = mqtt.connect(connectOptions);
    }

    dry_mqtt_client.on('connect', function () {
        console.log('msw_mqtt connected to ' + broker_ip);
        for(var idx in noti_topic) {
            if(noti_topic.hasOwnProperty(idx)) {
                dry_mqtt_client.subscribe(noti_topic[idx]);
                console.log('[msw_mqtt_connect] noti_topic[' + idx + ']: ' + noti_topic[idx]);
            }
        }
    });

    dry_mqtt_client.on('message', function (topic, message) {
        try {
            var msg_obj = JSON.parse(message.toString());
        }
        catch (e) {
        }

        if(msg_obj.hasOwnProperty('val2')) {
            func[topic.replace('/', '')](msg_obj.val, msg_obj.val2);
        }
        else {
            func[topic.replace('/', '')](msg_obj.val);
        }
    });

    dry_mqtt_client.on('error', function (err) {
        console.log(err.message);
    });
}

dry_mqtt_connect('localhost', 1883, dry_noti_topic);

///////////////////////////////////////////////////////////////////////////////

var dry_data_block = {};
dry_data_block.state = 'INPUT';
dry_data_block.ref_internal_temp = 80.0;
dry_data_block.ref_external_temp = 280.0;
dry_data_block.ref_elapsed_time = 5.0;
dry_data_block.internal_temp = 0.0;
dry_data_block.external_temp = 0.0;
dry_data_block.cur_weight = -0.1;
dry_data_block.ref_weight = 0.0;
dry_data_block.pre_weight = 0.0;
dry_data_block.tar_weight1 = 0.0;
dry_data_block.tar_weight2 = 0.0;
dry_data_block.tar_weight3 = 0.0;
dry_data_block.cum_weight = 0.0;
dry_data_block.cum_ref_weight = 3000;
dry_data_block.input_door = 0;
dry_data_block.output_door = 0;
dry_data_block.safe_door = 0;
dry_data_block.operation_mode = 0;
dry_data_block.debug_mode = 0;
dry_data_block.start_btn = 0;
dry_data_block.stirrer_mode = 0;
dry_data_block.elapsed_time = 0;
dry_data_block.debug_message = 'INPUT';
dry_data_block.loadcell_factor = 1841;
dry_data_block.loadcell_ref_weight = 20;
dry_data_block.correlation_value = 4.6;
dry_data_block.my_sortie_name = 'disarm';

try {
    Object.assign(dry_data_block, JSON.parse(fs.readFileSync('ddb.json', 'utf8')));
}
catch (e) {
    fs.writeFileSync('ddb.json', JSON.stringify(dry_data_block, null, 4), 'utf8');
}


var pre_state = 'None';
var pre_cur_weight = 9999;
var pre_loadcell_factor = -1.0;
var pre_input_door = -1;
var pre_output_door = -1;
var pre_safe_door = -1;
var pre_internal_temp = -1.0;
var pre_elapsed_time = -1;
var pre_debug_message = '';


dry_data_block.input_door = 0;
dry_data_block.output_door = 0;
dry_data_block.safe_door = 0;

dry_data_block.state = 'INPUT';
pre_state = '';

dry_data_block.debug_message = '                  ';
pre_debug_message = '';


///////////////////////////////////////////////////////////////////////////////
// function of food dryer machine controling, sensing

function print_lcd_state() {
    if(dry_mqtt_client != null) {
        if (pre_state != dry_data_block.state) {
            pre_state = dry_data_block.state;

            var msg_obj = {};
            msg_obj.val = dry_data_block.state;

            dry_mqtt_client.publish('/print_lcd_state', JSON.stringify(msg_obj));
        }
    }
}

function print_lcd_loadcell_factor() {
    if(dry_mqtt_client != null) {
        if (pre_loadcell_factor != dry_data_block.loadcell_factor) {
            pre_loadcell_factor = dry_data_block.loadcell_factor;

            var msg_obj = {};
            msg_obj.val = dry_data_block.loadcell_factor;
            msg_obj.val2 = dry_data_block.loadcell_ref_weight;
            dry_mqtt_client.publish('/print_lcd_loadcell_factor', JSON.stringify(msg_obj));
        }
    }
}

function print_lcd_input_door() {
    if(dry_mqtt_client != null) {
        if (pre_input_door != dry_data_block.input_door) {
            pre_input_door = dry_data_block.input_door;

            var msg_obj = {};
            msg_obj.val = dry_data_block.input_door;
            dry_mqtt_client.publish('/print_lcd_input_door', JSON.stringify(msg_obj));
        }
    }
}

function print_lcd_output_door() {
    if(dry_mqtt_client != null) {
        if (pre_output_door != dry_data_block.output_door) {
            pre_output_door = dry_data_block.output_door;

            var msg_obj = {};
            msg_obj.val = dry_data_block.output_door;
            dry_mqtt_client.publish('/print_lcd_output_door', JSON.stringify(msg_obj));
        }
    }
}

function print_lcd_safe_door() {
    if(dry_mqtt_client != null) {
        if (pre_safe_door != dry_data_block.safe_door) {
            pre_safe_door = dry_data_block.safe_door;

            var msg_obj = {};
            msg_obj.val = dry_data_block.safe_door;
            dry_mqtt_client.publish('/print_lcd_safe_door', JSON.stringify(msg_obj));
        }
    }
}

function print_lcd_elapsed_time() {
    if(dry_mqtt_client != null) {
        if (pre_elapsed_time != dry_data_block.elapsed_time) {
            pre_elapsed_time = dry_data_block.elapsed_time;

            var msg_obj = {};
            msg_obj.val = dry_data_block.elapsed_time;
            dry_mqtt_client.publish('/print_lcd_elapsed_time', JSON.stringify(msg_obj));
        }
    }
}

function print_lcd_debug_message() {
    if(dry_mqtt_client != null) {
        if (pre_debug_message != dry_data_block.debug_message) {
            pre_debug_message = dry_data_block.debug_message;

            var msg_obj = {};
            msg_obj.val = dry_data_block.debug_message;
            dry_mqtt_client.publish('/print_lcd_debug_message', JSON.stringify(msg_obj));
        }
    }
}

function set_solenoid(command) {
    if(dry_mqtt_client != null) {
        var msg_obj = {};
        msg_obj.val = command;
        dry_mqtt_client.publish('/set_solenoid', JSON.stringify(msg_obj));
    }
}

function set_fan(command) {
    if(dry_mqtt_client != null) {
        var msg_obj = {};
        msg_obj.val = command;
        dry_mqtt_client.publish('/set_fan', JSON.stringify(msg_obj));
    }
}

function set_heater(command1, command2, command3) {
    if(dry_mqtt_client != null) {
        var msg_obj = {};
        msg_obj.val = command1;
        //msg_obj.val2 = command2;
        //msg_obj.val3 = command3;
        dry_mqtt_client.publish('/set_heater', JSON.stringify(msg_obj));
    }
}

function set_stirrer(command) {
    if(dry_mqtt_client != null) {
        var msg_obj = {};
        msg_obj.val = command;
        dry_mqtt_client.publish('/set_stirrer', JSON.stringify(msg_obj));
    }
}

function set_lift(command) {
    if(dry_mqtt_client != null) {
        var msg_obj = {};
        msg_obj.val = command;
        dry_mqtt_client.publish('/set_lift', JSON.stringify(msg_obj));
    }
}

function set_crusher(command) {
    if(dry_mqtt_client != null) {
        var msg_obj = {};
        msg_obj.val = command;
        dry_mqtt_client.publish('/set_crusher', JSON.stringify(msg_obj));
    }
}

function set_cleaning_pump(command) {
    if(dry_mqtt_client != null) {
        var msg_obj = {};
        msg_obj.val = command;
        dry_mqtt_client.publish('/set_cleaning_pump', JSON.stringify(msg_obj));
    }
}

function set_buzzer() {
    if(dry_mqtt_client != null) {
        var msg_obj = {};
        msg_obj.val = 1;
        dry_mqtt_client.publish('/set_buzzer', JSON.stringify(msg_obj));
    }
}

function req_zero_point() {
    if(dry_mqtt_client != null) {
        var msg_obj = {};
        msg_obj.val = dry_data_block.loadcell_ref_weight;
        //console.log(dry_data_block.loadcell_ref_weight)
        dry_mqtt_client.publish('/req_zero_point', JSON.stringify(msg_obj));
    }
}

function req_calc_factor() {
    if(dry_mqtt_client != null) {
        var msg_obj = {};
        msg_obj.val = dry_data_block.loadcell_factor;
        dry_mqtt_client.publish('/req_calc_factor', JSON.stringify(msg_obj));
    }
}

var internal_temp_timer = null;
function req_internal_temp() {
    if(dry_mqtt_client != null) {
        var msg_obj = {};

        if(dry_data_block.state == 'INIT') {
        }
        else if(dry_data_block.state == 'DEBUG') {
        }
        else {
            msg_obj.val = 1;
            dry_mqtt_client.publish('/req_internal_temp', JSON.stringify(msg_obj));
            //console.log(msg_obj.val);
        }

        console.log('/req_internal_temp');

        clearTimeout(internal_temp_timer);
        internal_temp_timer = setTimeout(req_internal_temp, 5000);
    }
    else {
        clearTimeout(internal_temp_timer);
        internal_temp_timer = setTimeout(req_internal_temp, 1000 + parseInt(Math.random() * 1000));
    }
}

var input_door_timer = null;
function req_input_door() {
    if(dry_mqtt_client != null) {
        var msg_obj = {};
        msg_obj.val = 1;
        dry_mqtt_client.publish('/req_input_door', JSON.stringify(msg_obj));

        clearTimeout(input_door_timer);
        input_door_timer = setTimeout(req_input_door, 1000);
    }
    else {
        clearTimeout(input_door_timer);
        input_door_timer = setTimeout(req_input_door, 1000 + parseInt(Math.random() * 1000));
    }
}

var output_door_timer = null;
function req_output_door() {
    if(dry_mqtt_client != null) {
        var msg_obj = {};
        msg_obj.val = 1;
        dry_mqtt_client.publish('/req_output_door', JSON.stringify(msg_obj));

        clearTimeout(output_door_timer);
        output_door_timer = setTimeout(req_output_door, 1000);
    }
    else {
        clearTimeout(output_door_timer);
        output_door_timer = setTimeout(req_output_door, 1000 + parseInt(Math.random() * 1000));
    }
}

var safe_door_timer = null;
function req_safe_door() {
    if(dry_mqtt_client != null) {
        var msg_obj = {};
        msg_obj.val = 1;
        dry_mqtt_client.publish('/req_safe_door', JSON.stringify(msg_obj));

        clearTimeout(safe_door_timer);
        safe_door_timer = setTimeout(req_safe_door, 1000);
    }
    else {
        clearTimeout(safe_door_timer);
        safe_door_timer = setTimeout(req_safe_door, 1000 + parseInt(Math.random() * 1000));
    }
}

var weight_timer = null;
function req_weight() {
    if(dry_mqtt_client != null) {
        var msg_obj = {};

        if(dry_data_block.state == 'INIT') {
        }
        else if(dry_data_block.state == 'DEBUG') {
        }
        else {
            msg_obj.val = 1;
            dry_mqtt_client.publish('/req_weight', JSON.stringify(msg_obj));
            console.log('/req_weight');
        }

        clearTimeout(weight_timer);
        weight_timer = setTimeout(req_weight, 5000);
    }
    else {
        clearTimeout(weight_timer);
        weight_timer = setTimeout(req_weight, 1000 + parseInt(Math.random() * 1000));
    }
}

var operation_mode_timer = null;
function req_operation_mode() {
    if(dry_mqtt_client != null) {
        var msg_obj = {};
        msg_obj.val = 1;
        dry_mqtt_client.publish('/req_operation_mode', JSON.stringify(msg_obj));

        clearTimeout(operation_mode_timer);
        operation_mode_timer = setTimeout(req_operation_mode, 1000);
    }
    else {
        clearTimeout(operation_mode_timer);
        operation_mode_timer = setTimeout(req_operation_mode, 1000 + parseInt(Math.random() * 1000));
    }
}

var debug_mode_timer = null;
function req_debug_mode() {
    if(dry_mqtt_client != null) {
        var msg_obj = {};
        msg_obj.val = 1;
        dry_mqtt_client.publish('/req_debug_mode', JSON.stringify(msg_obj));
        //console.log(msg_obj.val);

        clearTimeout(debug_mode_timer);
        debug_mode_timer = setTimeout(req_debug_mode, 1000);
    }
    else {
        clearTimeout(debug_mode_timer);
        debug_mode_timer = setTimeout(req_debug_mode, 1000 + parseInt(Math.random() * 1000));
    }
}

var start_btn_timer = null;
function req_start_btn() {
    if(dry_mqtt_client != null) {
        var msg_obj = {};
        msg_obj.val = 1;
        dry_mqtt_client.publish('/req_start_btn', JSON.stringify(msg_obj));

        clearTimeout(start_btn_timer);
        start_btn_timer = setTimeout(req_start_btn, 1000);
    }
    else {
        clearTimeout(start_btn_timer);
        start_btn_timer = setTimeout(req_start_btn, 1000 + parseInt(Math.random() * 1000));
    }
}

function res_zero_point(val) {
    //dry_data_block.loadcell_factor = parseFloat(val.toString()).toFixed(1);

    debug_mode_state = 'put_on';
}

function res_calc_factor(val, val2) {
    dry_data_block.loadcell_factor = parseFloat(parseFloat(val.toString()).toFixed(1));
    dry_data_block.correlation_value = parseFloat(parseFloat(val2.toString()).toFixed(2));

    debug_mode_state = 'complete';
}


function res_internal_temp(val, val2) {
    dry_data_block.internal_temp = parseFloat(parseFloat(val.toString()).toFixed(1));
    dry_data_block.external_temp = parseFloat(parseFloat(val2.toString()).toFixed(1));

    if (pre_internal_temp != dry_data_block.internal_temp) {
        pre_internal_temp = dry_data_block.internal_temp;

        var msg_obj = {};
        msg_obj.val = dry_data_block.internal_temp;
        msg_obj.val2 = dry_data_block.external_temp;
        dry_mqtt_client.publish('/print_lcd_internal_temp', JSON.stringify(msg_obj));
    }

    clearTimeout(internal_temp_timer);
    internal_temp_timer = setTimeout(req_internal_temp, 2000 + parseInt(Math.random() * 100));
}

var input_door_close_count = 0;
var input_door_open_count = 0;
var output_door_close_count = 0;
var output_door_open_count = 0;
var safe_door_close_count = 0;
var safe_door_open_count = 0;

const DOOR_OPEN = 1;
const DOOR_CLOSE = 0;

const BTN_PRESS = 0;

function res_input_door(val) {
    var l_dec_val = parseInt(val.toString());
//     console.log('\nl_dec_val: ' + l_dec_val);
    var input_door = 0;
    var output_door = 0;
    var safe_door = 0;
    var start_btn = 0;
    var debug_btn = 0;

    if(l_dec_val&0x01) {
        input_door = 1;
    }

    if(l_dec_val&0x02) {
        output_door = 1;
    }

    if(l_dec_val&0x04) {
        safe_door = 1;
    }

    if(l_dec_val&0x08) {
        start_btn = 1;
    }

    if(l_dec_val&0x10) {
        debug_btn = 1;
    }

    var status = input_door;

    //console.log('in:' + status);

    if(status == DOOR_CLOSE) {
        input_door_close_count++;
        input_door_open_count = 0;
        if(input_door_close_count > 2) {
            input_door_close_count = 2;

            dry_data_block.input_door = DOOR_CLOSE;
        }
    }
    else {
        input_door_close_count = 0;
        input_door_open_count++;
        if(input_door_open_count > 2) {
            input_door_open_count = 2;

            dry_data_block.input_door = DOOR_OPEN;
        }
    }

    status = output_door;

    //console.log('out:' + status);

    if(status == DOOR_CLOSE) {
        output_door_close_count++;
        output_door_open_count = 0;
        if(output_door_close_count > 2) {
            output_door_close_count = 2;

            if(dry_data_block.output_door == DOOR_OPEN) {
                // dryer_event |= EVENT_OUTPUT_DOOR_CLOSE;
            }

            dry_data_block.output_door = DOOR_CLOSE;
        }
    }
    else {
        output_door_close_count = 0;
        output_door_open_count++;
        if(output_door_open_count > 2) {
            output_door_open_count = 2;

            if(dry_data_block.output_door == DOOR_CLOSE) {
                // dryer_event |= EVENT_OUTPUT_DOOR_OPEN;
            }

            dry_data_block.output_door = DOOR_OPEN;
        }
    }

    status = safe_door;

    //console.log('safe:' + status);

    if(status == DOOR_CLOSE) {
        safe_door_close_count++;
        safe_door_open_count = 0;
        if(safe_door_close_count > 2) {
            safe_door_close_count = 2;

            if(dry_data_block.safe_door == DOOR_OPEN) {
                dryer_event |= EVENT_SAFE_DOOR_CLOSE;
            }

            dry_data_block.safe_door = DOOR_CLOSE;
        }
    }
    else {
        safe_door_close_count = 0;
        safe_door_open_count++;
        if(safe_door_open_count > 2) {
            safe_door_open_count = 2;

            if(dry_data_block.safe_door == DOOR_CLOSE) {
                dryer_event |= EVENT_SAFE_DOOR_OPEN;
            }

            dry_data_block.safe_door = DOOR_OPEN;
        }
    }

    res_debug_mode(debug_btn);
    res_start_btn(start_btn);

    //clearTimeout(input_door_timer);
    //input_door_timer = setTimeout(req_input_door, 100 + parseInt(Math.random() * 100));
    //console.log(dry_data_block.input_door);
}

// var output_door_close_count = 0;
// var output_door_open_count = 0;
// function res_output_door(val) {
//     var status = parseInt(val.toString());
//
// //     console.log('out:' + status);
//
//     if(status == DOOR_CLOSE) {
//         output_door_close_count++;
//         output_door_open_count = 0;
//         if(output_door_close_count > 2) {
//             output_door_close_count = 2;
//
//             if(dry_data_block.output_door == DOOR_OPEN) {
//                 dryer_event |= EVENT_OUTPUT_DOOR_CLOSE;
//             }
//
//             dry_data_block.output_door = DOOR_CLOSE;
//         }
//     }
//     else {
//         output_door_close_count = 0;
//         output_door_open_count++;
//         if(output_door_open_count > 2) {
//             output_door_open_count = 2;
//
//             if(dry_data_block.output_door == DOOR_CLOSE) {
//                 dryer_event |= EVENT_OUTPUT_DOOR_OPEN;
//             }
//
//             dry_data_block.output_door = DOOR_OPEN;
//         }
//     }
//
//     //clearTimeout(output_door_timer);
//     //output_door_timer = setTimeout(req_output_door, 100 + parseInt(Math.random() * 100));
// }
//
// var safe_door_close_count = 0;
// var safe_door_open_count = 0;
// function res_safe_door(val) {
//     var status = parseInt((val).toString());
//
// //     console.log('safe:' + status);
//
//     if(status == DOOR_CLOSE) {
//         safe_door_close_count++;
//         safe_door_open_count = 0;
//         if(safe_door_close_count > 2) {
//             safe_door_close_count = 2;
//
//             if(dry_data_block.safe_door == DOOR_OPEN) {
//                 dryer_event |= EVENT_SAFE_DOOR_CLOSE;
//             }
//
//             dry_data_block.safe_door = DOOR_CLOSE;
//         }
//     }
//     else {
//         safe_door_close_count = 0;
//         safe_door_open_count++;
//         if(safe_door_open_count > 2) {
//             safe_door_open_count = 2;
//
//             if(dry_data_block.safe_door == DOOR_CLOSE) {
//                 dryer_event |= EVENT_SAFE_DOOR_OPEN;
//             }
//
//             dry_data_block.safe_door = DOOR_OPEN;
//         }
//     }
//
//     //clearTimeout(safe_door_timer);
//     //safe_door_timer = setTimeout(req_safe_door, 100 + parseInt(Math.random() * 100));
// }

function res_weight(val) {
//     console.log('weight: ' + val);
    dry_data_block.cur_weight = parseFloat(parseFloat(val.toString()).toFixed(1));
    console.log("\r\ncur_weight: " + dry_data_block.cur_weight + "\r\n");
    if (pre_cur_weight != dry_data_block.cur_weight) {
        //console.log(dry_data_block.cur_weight);
        pre_cur_weight = dry_data_block.cur_weight;


        var msg_obj = {};
        msg_obj.val = dry_data_block.cur_weight;
        msg_obj.val2 = dry_data_block.tar_weight3;
        dry_mqtt_client.publish('/print_lcd_loadcell', JSON.stringify(msg_obj));
    }

    clearTimeout(weight_timer);
    weight_timer = setTimeout(req_weight, 1500 + parseInt(Math.random() * 100));
}

var operation_press_count = 0;
var operation_release_count = 0;
function res_operation_mode(val) {
    var status = parseInt(val.toString());
    //console.log(status);
    if(status == 0) {
        operation_press_count++;
        operation_release_count = 0;
        if(operation_press_count > 2) {
            operation_press_count = 2;
            dry_data_block.operation_mode = 0;
        }
    }
    else {
        operation_press_count = 0;
        operation_release_count++;
        if(operation_release_count > 2) {
            operation_release_count = 2;
            dry_data_block.operation_mode = 1;
        }
    }

    //clearTimeout(operation_mode_timer);
    //operation_mode_timer = setTimeout(req_operation_mode, 100 + parseInt(Math.random() * 100));
}

var debug_press_count = 0;
var debug_release_count = 0;
var debug_once = 0;
function res_debug_mode(val) {
    var status = parseInt(val.toString());

    if(status == BTN_PRESS) {
        debug_press_count++;
        debug_release_count = 0;
        if(debug_press_count > 3) {
            debug_press_count = 3;
            dry_data_block.debug_mode = 1;

            if(debug_once == 1) {
                debug_once = 0;
                dryer_event_2 |= EVENT_DEBUG_BUTTON_PRESS;
            }
        }
    }
    else {
        debug_press_count = 0;
        debug_release_count++;
        if(debug_release_count > 3) {
            debug_release_count = 3;
            dry_data_block.debug_mode = 0;

            if(debug_once == 0) {
                debug_once = 1;
                dryer_event_2 |= EVENT_DEBUG_BUTTON_RELEASE;
            }
        }
    }

    //clearTimeout(debug_mode_timer);
    //debug_mode_timer = setTimeout(req_debug_mode, 100 + parseInt(Math.random() * 100));
}


var start_press_count = 0;
var start_press_flag = 0;
function res_start_btn(val) {
    var status = parseInt(val.toString());

    if(status == BTN_PRESS) {
        start_press_count++;
        if(4 < start_press_count && start_press_count <= 48) {
            start_press_flag = 1;
        }

        else if(48 < start_press_count) {
            start_press_flag = 2;
            
            dry_data_block.debug_message = 'LONG BTN CLICK';
        }
    }
    else {
        if(start_press_flag == 1) {
            dry_data_block.start_btn = 1;

            dryer_event |= EVENT_START_BUTTON;
            
            start_press_count = 0;
        }
        else if(start_press_flag == 2) {
            dry_data_block.start_btn = 2;
            
            dry_data_block.debug_message = '              ';

            dryer_event |= EVENT_START_BTN_LONG;
            start_press_count = 0;
        }

        start_press_flag = 0;
        start_press_count = 0;
    }

    //clearTimeout(start_btn_timer);
    //start_btn_timer = setTimeout(req_start_btn, 100 + parseInt(Math.random() * 100));
}

///////////////////////////////////////////////////////////////////////////////

var always_tick = 0;
var toggle_command = 1;
setTimeout(always_watchdog, first_interval);

function always_watchdog() {
    // - 내부온도 60도 이상 순환팬과 열교환기 냉각팬, 펌프 온
    // - 내부온도 60도 미만 순환팬과 열교환기 냉각팬, 펌프 오프

    if(parseFloat(dry_data_block.internal_temp) < 30.0) {
        // 순환팬 오프
        // 열교환기 냉각팬 오프

        set_fan(TURN_OFF);
    }
    else if(parseFloat(dry_data_block.internal_temp) >= 30.0) {
        // 순환팬 온
        // 열교환기 냉각팬 온

        set_fan(TURN_ON);
    }

    setTimeout(always_watchdog, always_interval);
}

///////////////////////////////////////////////////////////////////////////////

setTimeout(lcd_display_watchdog, display_interval);

function lcd_display_watchdog() {
    if(dry_data_block.state == 'DEBUG') {
        setTimeout(print_lcd_state, parseInt(Math.random() * 10));
        setTimeout(print_lcd_loadcell_factor, parseInt(Math.random() * 10));
        setTimeout(print_lcd_debug_message, parseInt(Math.random() * 10));
    }
    else {
        setTimeout(print_lcd_state, parseInt(Math.random() * 10));
        setTimeout(print_lcd_input_door, parseInt(Math.random() * 10));
        setTimeout(print_lcd_output_door, parseInt(Math.random() * 10));
        setTimeout(print_lcd_safe_door, parseInt(Math.random() * 10));
        setTimeout(print_lcd_elapsed_time, 0);
        setTimeout(print_lcd_debug_message, parseInt(Math.random() * 10));
    }

    setTimeout(lcd_display_watchdog, display_interval);
}


///////////////////////////////////////////////////////////////////////////////

var debug_mode_state = 'start';

//setTimeout(core_watchdog, 2000);

setTimeout(mon_input_door, 250);
setTimeout(mon_output_door, 250);
setTimeout(mon_safe_door, 250);

var input_door_once = 0;
function mon_input_door() {
    if (dry_data_block.input_door == DOOR_CLOSE){
        if (input_door_once == 0) {
            dryer_event |= EVENT_INPUT_DOOR_CLOSE;
            input_door_once = 1;
        }
        setTimeout(mon_input_door, 250);
    }
    else if (dry_data_block.input_door == DOOR_OPEN){
        input_door_once = 0;
        dryer_event |= EVENT_INPUT_DOOR_OPEN;
        setTimeout(mon_input_door, 5000);
    }

}

var output_door_once = 0;
function mon_output_door() {
    if (dry_data_block.output_door == DOOR_CLOSE){
        if (output_door_once == 0) {
            dryer_event |= EVENT_OUTPUT_DOOR_CLOSE;
            output_door_once = 1;
        }
        setTimeout(mon_output_door, 250);
    }
    else if (dry_data_block.output_door == DOOR_OPEN){
        output_door_once = 0;
        dryer_event |= EVENT_OUTPUT_DOOR_OPEN;
        setTimeout(mon_output_door, 5000);
    }
}

var safe_door_once = 0;
function mon_safe_door() {
    if (dry_data_block.safe_door == DOOR_CLOSE){
        if (safe_door_once == 0) {
            dryer_event |= EVENT_SAFE_DOOR_CLOSE;
            safe_door_once = 1;
        }
        setTimeout(mon_safe_door, 250);
    }
    else if (dry_data_block.input_door == DOOR_OPEN){
        safe_door_once = 0;
        dryer_event |= EVENT_SAFE_DOOR_OPEN;
        setTimeout(mon_safe_door, 5000);
    }
}

setTimeout(heat_watchdog, 1000);

function heat_watchdog() {
    if (dry_data_block.state == 'INPUT'){
        set_heater(TURN_OFF, TURN_OFF, TURN_OFF);
        set_stirrer(TURN_OFF);
    }
    else if(dry_data_block.state == 'DEBUG') {
        if (debug_mode_state == 'start') {
            console.log("Start zero point");

            dry_data_block.debug_message = 'Start zero point';
            pre_debug_message = '';

            req_zero_point();

            debug_mode_state = 'start_waiting';

            //setTimeout(core_watchdog, normal_interval);
        }
        else if (debug_mode_state == 'put_on') {
            dry_data_block.debug_message = 'Put weight on - ' + dry_data_block.loadcell_ref_weight;
            pre_debug_message = '';

            debug_mode_state = 'put_on_waiting';

            //setTimeout(core_watchdog, normal_interval);
        }
        else if (debug_mode_state == 'complete') {
            dry_data_block.debug_message = 'Complete zero point';
            pre_debug_message = '';

            debug_mode_state = 'completed';

            var obj = {};
            obj.loadcell_factor = dry_data_block.loadcell_factor;
            obj.correlation_value = dry_data_block.correlation_value;
            send_to_Mobius(zero_mission_name, obj);
        }
        else {
        }
    }
    else if (dry_data_block.state == 'HEAT'){
        dry_data_block.elapsed_time++;

        if(parseFloat(dry_data_block.external_temp) < parseFloat(dry_data_block.ref_external_temp) && parseFloat(dry_data_block.internal_temp) < parseFloat(dry_data_block.ref_internal_temp)) {
            set_heater(TURN_ON, TURN_ON, TURN_ON);
            set_stirrer(TURN_ON);
        }
        else {
            set_heater(TURN_OFF, TURN_OFF, TURN_OFF);
            set_stirrer(TURN_ON);
        }

        cur_weight = parseFloat(dry_data_block.cur_weight) - parseFloat(dry_data_block.pre_weight)

        if (cur_weight <= parseFloat(dry_data_block.tar_weight3) || dry_data_block.elapsed_time > (parseInt(dry_data_block.ref_elapsed_time)*60*60)) {
            dry_data_block.cum_weight += dry_data_block.ref_weight;

            //console.log('heater 0');

            dry_data_block.ref_weight = 0.0;
            dry_data_block.pre_weight = 0.0;
            dry_data_block.tar_weight1 = 0.0;
            dry_data_block.tar_weight2 = 0.0;
            dry_data_block.tar_weight3 = 0.0;

            fs.writeFileSync('ddb.json', JSON.stringify(dry_data_block, null, 4), 'utf8');

            dry_data_block.state = 'END';
            pre_state = '';

            dry_data_block.my_sortie_name = 'disarm';
            send_to_Mobius(my_cnt_name, dry_data_block);

            set_heater(TURN_OFF, TURN_OFF, TURN_OFF);
            set_stirrer(TURN_OFF);

            set_buzzer();

            my_sortie_name = 'disarm';
            my_cnt_name = my_parent_cnt_name + '/' + my_sortie_name;

            dryer_event_2 |= EVENT_HEAT_COMPLETE;
        }
    }
    else if (dry_data_block.state == 'EXHAUST'){
        if (dry_data_block.cur_weight <= 0.5){
            dryer_event_2 |= EVENT_EXHAUST_COMPLETE;
        }
    }
    else if (dry_data_block.state == 'TARGETING') {
        dry_data_block.elapsed_time = 0;
        
        set_stirrer(TURN_ON);
        targeting_tick_count++;
        if(targeting_tick_count >= (60*6)) {
            dry_data_block.ref_weight = dry_data_block.ref_weight + dry_data_block.cur_weight - dry_data_block.pre_weight;

            dry_data_block.tar_weight1 = parseFloat(parseFloat(dry_data_block.ref_weight * 0.60).toFixed(1));
            dry_data_block.tar_weight2 = parseFloat(parseFloat(dry_data_block.ref_weight * 0.30).toFixed(1));
            dry_data_block.tar_weight3 = parseFloat(parseFloat(dry_data_block.ref_weight * 0.10).toFixed(1));

            fs.writeFileSync('ddb.json', JSON.stringify(dry_data_block, null, 4), 'utf8');

            console.log(dry_data_block.state);
            dry_data_block.state = 'HEAT';
            pre_state = '';
            console.log('->' + dry_data_block.state);

            dry_data_block.my_sortie_name = moment().utc().format('YYYY_MM_DD_T_HH');
            send_to_Mobius(my_cnt_name, dry_data_block);

            dry_data_block.debug_message = ' ';
            pre_debug_message = '';

            set_heater(TURN_ON, TURN_ON, TURN_ON);
            set_stirrer(TURN_ON);

            my_sortie_name = moment().utc().format('YYYY_MM_DD_T_HH');
            my_cnt_name = my_parent_cnt_name + '/' + my_sortie_name;
            sh_adn.crtct(my_parent_cnt_name + '?rcn=0', my_sortie_name, 0, function (rsc, res_body, count) {
            });
        }
    }
    
    setTimeout(heat_watchdog, 1000);
}

function do_before_input() {
    dry_data_block.input_door = 0;
    dry_data_block.output_door = 0;
    dry_data_block.safe_door = 0;

    sh_adn.rtvct(zero_mission_name+'/la', 0, function (rsc, res_body, count) {
        if (rsc == 2000) {
            var zero_obj = res_body[Object.keys(res_body)[0]].con;

            dry_data_block.loadcell_factor = zero_obj.loadcell_factor;
            dry_data_block.correlation_value = zero_obj.correlation_value;

            if(dry_mqtt_client != null) {
                var msg_obj = {};
                msg_obj.val = dry_data_block.loadcell_factor;
                msg_obj.val2 = dry_data_block.correlation_value;
                dry_mqtt_client.publish('/set_zero_point', JSON.stringify(msg_obj));
            }
        }
    });

    dry_data_block.debug_message = ' ';
    pre_debug_message = '';
    pre_input_door = -1;
    pre_output_door = -1;
    pre_safe_door = -1;
    pre_elapsed_time = -1;
    pre_cur_weight = 9999;

    dry_data_block.cur_weight = -0.1;
    dry_data_block.ref_weight = 0.0;
    dry_data_block.pre_weight = 0.0;
    dry_data_block.tar_weight1 = 0.0;
    dry_data_block.tar_weight2 = 0.0;
    dry_data_block.tar_weight3 = 0.0;

    pre_cur_weight = dry_data_block.cur_weight;
    
    console.log(dry_data_block.state);
    dry_data_block.state = 'INPUT';
    pre_state = '';
    console.log('->' + dry_data_block.state);

    set_heater(TURN_OFF, TURN_OFF, TURN_OFF);
    set_stirrer(TURN_OFF);
    set_lift(TURN_BACK);
    set_crusher(TURN_OFF);
    set_cleaning_pump(TURN_OFF);
    
    set_buzzer();
}

do_before_input();

setTimeout(dryer_event_handler, 100);

function dryer_event_handler() {
    if (dryer_event & EVENT_INPUT_DOOR_OPEN) {
        dryer_event &= ~EVENT_INPUT_DOOR_OPEN;
        if (dry_data_block.state != 'DEBUG') {
            // console.log("dryer event handler door open");
            dry_data_block.debug_message = 'Close input door';
            set_buzzer();
            //set_stirrer(TURN_OFF);
            //set_heater(TURN_OFF, TURN_OFF, TURN_OFF);
        }
    } 
    else if (dryer_event & EVENT_INPUT_DOOR_CLOSE) {
        dryer_event &= ~EVENT_INPUT_DOOR_CLOSE;
        if (dry_data_block.state != 'DEBUG') {
            dry_data_block.debug_message = '                ';
        }
    }

    else if (dryer_event & EVENT_OUTPUT_DOOR_OPEN) {
        dryer_event &= ~EVENT_OUTPUT_DOOR_OPEN;
        if (dry_data_block.state == 'DEBUG') {
            //set_heater(TURN_OFF, TURN_OFF, TURN_OFF);
            //set_stirrer(TURN_ON);
        } 
        else if (dry_data_block.state == 'EXHAUST') {
            //set_heater(TURN_OFF, TURN_OFF, TURN_OFF);
            set_stirrer(TURN_ON);
        } 
        else {
            dry_data_block.debug_message = 'Close output door';
            set_buzzer();
            set_stirrer(TURN_OFF);
            //set_heater(TURN_OFF, TURN_OFF, TURN_OFF);
        }
    } 
    else if (dryer_event & EVENT_OUTPUT_DOOR_CLOSE) {
        dryer_event &= ~EVENT_OUTPUT_DOOR_CLOSE;
        if (dry_data_block.state != 'DEBUG') {
            dry_data_block.debug_message = '                ';
        }
    }

    else if (dryer_event & EVENT_SAFE_DOOR_OPEN) {
        dryer_event &= ~EVENT_SAFE_DOOR_OPEN;
        if (dry_data_block.state != 'DEBUG') {
            dry_data_block.debug_message = 'Close safe door';
            set_buzzer();
        }
    } 
    else if (dryer_event & EVENT_SAFE_DOOR_CLOSE) {
        dryer_event &= ~EVENT_SAFE_DOOR_CLOSE;
        if (dry_data_block.state != 'DEBUG') {
            dry_data_block.debug_message = '                ';
        }
    }

    else if (dryer_event_2 & EVENT_HEAT_COMPLETE) {
        dryer_event_2 &= ~EVENT_HEAT_COMPLETE;
        if (dry_data_block.state == 'HEAT') {
            dry_data_block.debug_message = 'HEAT complete';

            set_buzzer();
            set_heater(TURN_OFF, TURN_OFF, TURN_OFF);
            set_stirrer(TURN_OFF);

            dry_data_block.state = 'END';
            pre_state = '';

        }
        dryer_event_2 |= EVENT_END_ACTION;
    }

    else if (dryer_event & EVENT_START_BUTTON) {
        dryer_event &= ~EVENT_START_BUTTON;
        if (dry_data_block.state == 'INPUT') {
            dry_data_block.debug_message = '              ';
            
            //set_heater(TURN_OFF, TURN_OFF, TURN_OFF);
            set_heater(TURN_ON, TURN_ON, TURN_ON);
            set_stirrer(TURN_ON);
            set_lift(TURN_OFF);
            set_crusher(TURN_OFF);
            set_cleaning_pump(TURN_OFF);

            console.log(dry_data_block.state + '->' + dry_data_block.state);
            dry_data_block.state = 'TARGETING';
            pre_state = '';

            lift_seq = 0;
            crusher_seq = 0;
            
            lifting();
            crusher();

            targeting_tick_count = 0;

            dry_data_block.pre_weight = dry_data_block.cur_weight;
        }

        else if (dry_data_block.state == 'DEBUG') {
            if(debug_mode_state == 'put_on_waiting') {

                dry_data_block.debug_message = 'Calculating';
                pre_debug_message = '';

                req_calc_factor();
            }
        }
    }
    
    else if(dryer_event & EVENT_START_BTN_LONG) {
        dryer_event &= ~EVENT_START_BTN_LONG;

        if (dry_data_block.state == 'INPUT') {
            dry_data_block.debug_message = 'Reset the catalyst';
            pre_debug_message = '';
            set_buzzer();
        
            dry_data_block.cum_weight = 0;
        }
     }

    else if (dryer_event_2 & EVENT_DEBUG_BUTTON_PRESS) {
        dryer_event_2 &= ~EVENT_DEBUG_BUTTON_PRESS;
        if (dry_data_block.state == 'INPUT') {
            pre_cur_weight = dry_data_block.cur_weight;

            if (dry_data_block.debug_mode == 1) {
                debug_mode_state = 'start';

                console.log(dry_data_block.state);
                dry_data_block.state = 'DEBUG';
                pre_state = '';
                console.log('->' + dry_data_block.state);

                set_buzzer();
            }
            else {
                pre_input_door = -1;
                pre_output_door = -1;
                pre_safe_door = -1;
                pre_cur_weight = 9999;
            }
        }
    }
    
    else if (dryer_event_2 & EVENT_DEBUG_BUTTON_RELEASE) {
        dryer_event_2 &= ~EVENT_DEBUG_BUTTON_RELEASE;
        if (dry_data_block.state == 'DEBUG'){
            if (dry_data_block.debug_mode == 0) {
                do_before_input();
            }
        }
    }

    else if (dryer_event_2 & EVENT_EXHAUST_COMPLETE) {
        dryer_event_2 &= ~EVENT_EXHAUST_COMPLETE;
        if (dry_data_block.state == 'EXHAUST') {
            do_before_input();
        }
    }

    else if (dryer_event_2 & EVENT_END_ACTION) {
        dryer_event_2 &= ~EVENT_END_ACTION;
        if (dry_data_block.state == 'END') {
            do_before_input();
        }
    }

    setTimeout(dryer_event_handler, 100);
}

setTimeout(check_cum_ref_weight, 20000);

function check_cum_ref_weight() {
    if (dry_data_block.state == 'INPUT') {
        if (dry_data_block.cum_weight > dry_data_block.cum_ref_weight) {
            dry_data_block.debug_message = 'Exchange catalyst';
            pre_debug_message = '';
            set_buzzer();
            
            dry_data_block.state = 'EXHAUST'
            pre_state = '';
        }
    }
    setTimeout(check_cum_ref_weight, 20000);
}


var input_door_delay_count = 0;
var output_door_delay_count = 0;
var safe_door_delay_count = 0;
var exception_delay_count = 0;

var lift_seq = 0;
function lifting() {
    if(lift_seq == 0) {
        set_lift(TURN_OFF);

        lift_seq = 1;
        setTimeout(lifting, 10);
    }
    else if(lift_seq == 1) {
        set_lift(TURN_ON);

        lift_seq = 2;
        setTimeout(lifting, 20000);
    }
    else if(lift_seq == 2) {
        set_lift(TURN_OFF);

        lift_seq = 3;
        setTimeout(lifting, 10);
    }
    else if(lift_seq == 3) {
        set_lift(TURN_BACK);

        lift_seq = 4;
        setTimeout(lifting, 1000);
    }
    else if(lift_seq == 4) {
        set_lift(TURN_OFF);

        lift_seq = 5;
        setTimeout(lifting, 10);
    }
    else if(lift_seq == 5) {
        set_lift(TURN_ON);

        lift_seq = 6;
        setTimeout(lifting, 5000);
    }
    else if(lift_seq == 6) {
        set_lift(TURN_OFF);

        lift_seq = 7;
        setTimeout(lifting, 10);
    }
    else if(lift_seq == 7) {
        set_lift(TURN_BACK);

        lift_seq = 8;
        setTimeout(lifting, 16000);
    }
    else if(lift_seq == 8) {
        set_lift(TURN_OFF);

        lift_seq = 0;
    }
}
var crusher_seq = 0;
function crusher() {
    if(crusher_seq == 0) {
        set_crusher(TURN_OFF);

        crusher_seq = 1;
        setTimeout(crusher, 10);
    }
    else if(crusher_seq == 1) {
        set_crusher(TURN_ON);

        crusher_seq = 2;
        setTimeout(crusher, 3*(60*1000));
    }
    else if(crusher_seq == 2) {
        set_crusher(TURN_ON);
        set_cleaning_pump(TURN_ON);

        crusher_seq = 3;
        setTimeout(crusher, 2*(60*1000));
    }
    else if(crusher_seq == 3) {
        set_crusher(TURN_OFF);
        set_cleaning_pump(TURN_OFF);

        crusher_seq = 0;
    }
}

var targeting_tick_count = 0;
var cur_weight = 0.0;
/*function core_watchdog() {
    //console.log(dry_data_block.debug_mode);
    //console.log(dry_data_block.state);
    if(dry_data_block.state == 'INIT') {
        // pre_input_door = -1;
        // pre_output_door = -1;
        // pre_safe_door = -1;
        //
        // if(core_delay_count == 0) {
        //     set_heater(TURN_OFF, TURN_OFF, TURN_OFF);
        //     set_stirrer(TURN_OFF);
        //     set_lift(TURN_BACK);
        //     set_crusher(TURN_OFF);
        //     set_cleaning_pump(TURN_OFF);
        // }
        //
        // core_delay_count++;
        // if(core_delay_count > 10) {
        //     core_delay_count = 0;
        // }

        // if(dryer_event & EVENT_START_BUTTON) {
        //     dryer_event &= ~EVENT_START_BUTTON;
        // }
        // else if(dryer_event & EVENT_START_BTN_LONG) {
        //     dryer_event &= ~EVENT_START_BTN_LONG;
        // }
        // else if(dryer_event & EVENT_OUTPUT_DOOR_OPEN) {
        //     dryer_event &= ~EVENT_OUTPUT_DOOR_OPEN;
        //     dry_data_block.debug_message = 'Close output door';
        //     pre_debug_message = '';
        //     set_buzzer();
        //     output_door_delay_count = 1;
        // }
        // else if(dryer_event & EVENT_OUTPUT_DOOR_CLOSE) {
        //     dryer_event &= ~EVENT_OUTPUT_DOOR_CLOSE;
        //     dry_data_block.debug_message = ' ';
        //     pre_debug_message = '';
        // }
        // else if(dryer_event & EVENT_SAFE_DOOR_OPEN) {
        //     dryer_event &= ~EVENT_SAFE_DOOR_OPEN;
        //     dry_data_block.debug_message = 'Close safe door';
        //     pre_debug_message = '';
        //     set_buzzer();
        //     safe_door_delay_count = 1;
        // }
        // else if(dryer_event & EVENT_SAFE_DOOR_CLOSE) {
        //     dryer_event &= ~EVENT_SAFE_DOOR_CLOSE;
        //     dry_data_block.debug_message = ' ';
        //     pre_debug_message = '';
        // }
        // else {
        //     if (dry_data_block.safe_door == 0) {
        //         safe_door_delay_count = 0;
        //         if (dry_data_block.output_door == 0) {
        //             output_door_delay_count = 0;
        //
        //             contents_delay_count = 0;
        //             sh_adn.rtvct(zero_mission_name+'/la', 0, function (rsc, res_body, count) {
        //                 if (rsc == 2000) {
        //                     var zero_obj = res_body[Object.keys(res_body)[0]].con;
        //
        //                     dry_data_block.loadcell_factor = zero_obj.loadcell_factor;
        //                     dry_data_block.correlation_value = zero_obj.correlation_value;
        //
        //                     if(dry_mqtt_client != null) {
        //                         var msg_obj = {};
        //                         msg_obj.val = dry_data_block.loadcell_factor;
        //                         msg_obj.val2 = dry_data_block.correlation_value;
        //                         dry_mqtt_client.publish('/set_zero_point', JSON.stringify(msg_obj));
        //                     }
        //                 }
        //             });
        //
        //             dry_data_block.debug_message = ' ';
        //             pre_debug_message = '';
        //
        //             dry_data_block.cur_weight = 0.0;
        //             dry_data_block.ref_weight = 0.0;
        //             dry_data_block.pre_weight = 0.0;
        //             dry_data_block.tar_weight1 = 0.0;
        //             dry_data_block.tar_weight2 = 0.0;
        //             dry_data_block.tar_weight3 = 0.0;
        //
        //             dry_data_block.state = 'INPUT';
        //             pre_state = '';
        //             print_lcd_state();
        //
        //             dry_data_block.elapsed_time = 0;
        //             core_delay_count = 0;
        //
        //             if (dry_data_block.cum_weight > dry_data_block.cum_ref_weight) {
        //                 dry_data_block.debug_message = 'Replace the catalyst';
        //                 pre_debug_message = '';
        //                 set_buzzer();
        //             }
        //
        //             pre_cur_weight = dry_data_block.cur_weight;
        //         }
        //         else {
        //             if(output_door_delay_count == 0) {
        //                 dry_data_block.debug_message = 'Close output door';
        //                 pre_debug_message = '';
        //                 set_buzzer();
        //             }
        //
        //             output_door_delay_count++;
        //             if(output_door_delay_count > 40) {
        //                 output_door_delay_count = 0;
        //             }
        //         }
        //     }
        //     else {
        //         if(safe_door_delay_count == 0) {
        //             dry_data_block.debug_message = 'Close safe door';
        //             pre_debug_message = '';
        //             set_buzzer();
        //         }
        //
        //         safe_door_delay_count++;
        //         if(safe_door_delay_count > 40) {
        //             safe_door_delay_count = 0;
        //         }
        //     }
        // }

        setTimeout(core_watchdog, normal_interval);
    }

    else if(dry_data_block.state == 'INPUT') {
        // if(dryer_event & EVENT_START_BUTTON) {
        //     dryer_event &= ~EVENT_START_BUTTON;
        //
        //     if (dry_data_block.safe_door == 0) {
        //         if (dry_data_block.output_door == 0) {
        //             if (dry_data_block.input_door == 0) {
        //                 set_heater(TURN_OFF, TURN_OFF, TURN_OFF);
        //                 set_stirrer(TURN_ON);
        //                 set_lift(TURN_BACK);
        //                 set_crusher(TURN_OFF);
        //                 set_cleaning_pump(TURN_OFF);
        //
        //                 console.log(dry_data_block.state);
        //                 dry_data_block.state = 'TARGETING';
        //                 pre_state = '';
        //                 print_lcd_state();
        //                 console.log('->' + dry_data_block.state);
        //
        //                 core_delay_count = 0;
        //
        //                 lift_seq = 0;
        //                 crusher_seq = 0;
        //                 lifting();
        //                 crusher();
        //
        //                 targeting_tick_count = 0;
        //
        //                 dry_data_block.pre_weight = dry_data_block.cur_weight;
        //             }
        //             else {
        //                 if(input_door_delay_count == 0) {
        //                     dry_data_block.debug_message = 'Close input door';
        //                     pre_debug_message = '';
        //                     set_buzzer();
        //                 }
        //
        //                 input_door_delay_count++;
        //                 if(input_door_delay_count > 40) {
        //                     input_door_delay_count = 0;
        //                 }
        //             }
        //         }
        //         else {
        //             if(output_door_delay_count == 0) {
        //                 dry_data_block.debug_message = 'Close output door';
        //                 pre_debug_message = '';
        //                 set_buzzer();
        //             }
        //
        //             output_door_delay_count++;
        //             if(output_door_delay_count > 40) {
        //                 output_door_delay_count = 0;
        //             }
        //         }
        //     }
        //     else {
        //         if(safe_door_delay_count == 0) {
        //             dry_data_block.debug_message = 'Close safe door';
        //             pre_debug_message = '';
        //             set_buzzer();
        //         }
        //
        //         safe_door_delay_count++;
        //         if(safe_door_delay_count > 40) {
        //             safe_door_delay_count = 0;
        //         }
        //     }
        // }
        // else if(dryer_event & EVENT_START_BTN_LONG) {
        //     dryer_event &= ~EVENT_START_BTN_LONG;
        //
        //     dry_data_block.debug_message = 'Reset the catalyst';
        //     pre_debug_message = '';
        //     set_buzzer();
        //
        //     dry_data_block.cum_weight = 0;
        // }
        // else if(dryer_event & EVENT_OUTPUT_DOOR_OPEN) {
        //     dryer_event &= ~EVENT_OUTPUT_DOOR_OPEN;
        //
        //     console.log('EVENT_OUTPUT_DOOR_OPEN');
        //
        //     dry_data_block.debug_message = 'Close output door';
        //     pre_debug_message = '';
        //     set_buzzer();
        //
        //     set_stirrer(TURN_ON);
        // }
        // else if(dryer_event & EVENT_OUTPUT_DOOR_CLOSE) {
        //     dryer_event &= ~EVENT_OUTPUT_DOOR_CLOSE;
        //
        //     dry_data_block.debug_message = ' ';
        //     pre_debug_message = '';
        //
        //     set_stirrer(TURN_OFF);
        // }
        // else if(dryer_event & EVENT_SAFE_DOOR_OPEN) {
        //     dryer_event &= ~EVENT_SAFE_DOOR_OPEN;
        //
        //     dry_data_block.debug_message = 'Close safe door';
        //     pre_debug_message = '';
        //     set_buzzer();
        // }
        // else if(dryer_event & EVENT_SAFE_DOOR_CLOSE) {
        //     dryer_event &= ~EVENT_SAFE_DOOR_CLOSE;
        //
        //     dry_data_block.debug_message = ' ';
        //     pre_debug_message = '';
        // }
        // else {
        //     pre_cur_weight = dry_data_block.cur_weight;
        //
        //     if (dry_data_block.debug_mode == 1) {
        //         debug_mode_state = 'start';
        //
        //         console.log(dry_data_block.state);
        //         dry_data_block.state = 'DEBUG';
        //         pre_state = '';
        //         print_lcd_state();
        //         console.log('->' + dry_data_block.state);
        //
        //         set_buzzer();
        //     }
        //     else {
        //     }
        // }

        setTimeout(core_watchdog, normal_interval);
    }

    else if(dry_data_block.state == 'TARGETING') {
        // if(core_delay_count == 0) {
        //     set_stirrer(TURN_ON);
        // }
        //
        // core_delay_count++;
        // if(core_delay_count > 50) {
        //     core_delay_count = 0;
        // }
        //
        // targeting_tick_count++;
        // if(targeting_tick_count >= (10*60*6)) {
        //     dry_data_block.ref_weight = dry_data_block.ref_weight + dry_data_block.cur_weight - dry_data_block.pre_weight;
        //
        //     dry_data_block.tar_weight1 = parseFloat(parseFloat(dry_data_block.ref_weight * 0.60).toFixed(1));
        //     dry_data_block.tar_weight2 = parseFloat(parseFloat(dry_data_block.ref_weight * 0.30).toFixed(1));
        //     dry_data_block.tar_weight3 = parseFloat(parseFloat(dry_data_block.ref_weight * 0.10).toFixed(1));
        //
        //     fs.writeFileSync('ddb.json', JSON.stringify(dry_data_block, null, 4), 'utf8');
        //
        //     console.log(dry_data_block.state);
        //     dry_data_block.state = 'HEAT';
        //     pre_state = '';
        //     print_lcd_state();
        //     console.log('->' + dry_data_block.state);
        //
        //     core_delay_count = 0;
        //
        //     dry_data_block.my_sortie_name = moment().utc().format('YYYY_MM_DD_T_HH');
        //     send_to_Mobius(my_cnt_name, dry_data_block);
        //
        //     dry_data_block.debug_message = ' ';
        //     pre_debug_message = '';
        //
        //     set_heater(TURN_ON, TURN_ON, TURN_ON);
        //     set_stirrer(TURN_ON);
        //
        //     my_sortie_name = moment().utc().format('YYYY_MM_DD_T_HH');
        //     my_cnt_name = my_parent_cnt_name + '/' + my_sortie_name;
        //     sh_adn.crtct(my_parent_cnt_name + '?rcn=0', my_sortie_name, 0, function (rsc, res_body, count) {
        //     });
        // }
        // else {
        //
        // }
        //
        // if(dryer_event & EVENT_INPUT_DOOR_OPEN) {
        //     dryer_event &= ~EVENT_INPUT_DOOR_OPEN;
        // }
        // else if(dryer_event & EVENT_INPUT_DOOR_CLOSE) {
        //     dryer_event &= ~EVENT_INPUT_DOOR_CLOSE;
        // }
        // else if(dryer_event & EVENT_OUTPUT_DOOR_OPEN) {
        //     dryer_event &= ~EVENT_OUTPUT_DOOR_OPEN;
        //
        //     console.log('EVENT_OUTPUT_DOOR_OPEN');
        //
        //     dry_data_block.debug_message = 'Close output door';
        //     pre_debug_message = '';
        //     set_buzzer();
        //
        //     set_stirrer(TURN_ON);
        // }
        // else if(dryer_event & EVENT_OUTPUT_DOOR_CLOSE) {
        //     dryer_event &= ~EVENT_OUTPUT_DOOR_CLOSE;
        //
        //     dry_data_block.debug_message = ' ';
        //     pre_debug_message = '';
        //
        //     set_stirrer(TURN_OFF);
        // }
        // else if(dryer_event & EVENT_SAFE_DOOR_OPEN) {
        //     dryer_event &= ~EVENT_SAFE_DOOR_OPEN;
        //
        //     dry_data_block.debug_message = 'Close safe door';
        //     pre_debug_message = '';
        //     set_buzzer();
        // }
        // else if(dryer_event & EVENT_SAFE_DOOR_CLOSE) {
        //     dryer_event &= ~EVENT_SAFE_DOOR_CLOSE;
        //
        //     dry_data_block.debug_message = ' ';
        //     pre_debug_message = '';
        // }
        // else {
        //     if (dry_data_block.debug_mode == 1) {
        //         debug_mode_state = 'start';
        //
        //         console.log(dry_data_block.state);
        //         dry_data_block.state = 'DEBUG';
        //         pre_state = '';
        //         print_lcd_state();
        //         console.log('->' + dry_data_block.state);
        //
        //         set_buzzer();
        //     }
        //     else {
        //     }
        // }

        setTimeout(core_watchdog, normal_interval);
    }

    else if(dry_data_block.state == 'HEAT') {
        // if(dryer_event & EVENT_START_BUTTON) {
        //     dryer_event &= ~EVENT_START_BUTTON;
        // }
        // else if(dryer_event & EVENT_START_BTN_LONG) {
        //     dryer_event &= ~EVENT_START_BTN_LONG;
        //
        //     set_buzzer();
        //
        //     dry_data_block.state = 'INPUT';
        //     pre_state = '';
        //     print_lcd_state();
        //
        //     dry_data_block.elapsed_time = 0;
        //
        //     // 스위치가 INPUT 모드로 되어 있다면
        //     set_heater(TURN_OFF, TURN_OFF, TURN_OFF);
        //     set_stirrer(TURN_OFF);
        // }
            // else if(dryer_event & EVENT_INPUT_DOOR_OPEN) {
            //     dryer_event &= ~EVENT_INPUT_DOOR_OPEN;
            //
            //     dry_data_block.debug_message = 'Exception';
            //     pre_debug_message = '';
            //
            //     dry_data_block.state = 'EXCEPTION';
            //     pre_state = '';
            //     print_lcd_state();
            //
            //     set_heater(TURN_OFF, TURN_OFF, TURN_OFF);
            //     set_stirrer(TURN_OFF);
            //
            //     set_buzzer();
            //
            //     exception_delay_count = 0;
            //     contents_delay_count = 0;
            // }
            // else if(dryer_event & EVENT_INPUT_DOOR_CLOSE) {
            //     dryer_event &= ~EVENT_INPUT_DOOR_CLOSE;
            // }
            // else if(dryer_event & EVENT_OUTPUT_DOOR_OPEN) {
            //     dryer_event &= ~EVENT_OUTPUT_DOOR_OPEN;
            //
            //     dry_data_block.debug_message = 'Exception';
            //     pre_debug_message = '';
            //
            //     dry_data_block.state = 'EXCEPTION';
            //     pre_state = '';
            //     print_lcd_state();
            //
            //     set_heater(TURN_OFF, TURN_OFF, TURN_OFF);
            //     set_stirrer(TURN_OFF);
            //
            //     set_buzzer();
            //
            //     exception_delay_count = 0;
            //     contents_delay_count = 0;
            // }
            // else if(dryer_event & EVENT_OUTPUT_DOOR_CLOSE) {
            //     dryer_event &= ~EVENT_OUTPUT_DOOR_CLOSE;
            // }
            // else if(dryer_event & EVENT_SAFE_DOOR_OPEN) {
            //     dryer_event &= ~EVENT_SAFE_DOOR_OPEN;
            //
            //     dry_data_block.debug_message = 'Exception';
            //     pre_debug_message = '';
            //
            //     dry_data_block.state = 'EXCEPTION';
            //     pre_state = '';
            //     print_lcd_state();
            //
            //     core_delay_count = 0;
            //
            //     set_heater(TURN_OFF, TURN_OFF, TURN_OFF);
            //     set_stirrer(TURN_OFF);
            //
            //     set_buzzer();
            //
            //     exception_delay_count = 0;
            //     contents_delay_count = 0;
            // }
            // else if(dryer_event & EVENT_SAFE_DOOR_CLOSE) {
            //     dryer_event &= ~EVENT_SAFE_DOOR_CLOSE;
        // }
        // else {
        //     if(parseFloat(dry_data_block.external_temp) < parseFloat(dry_data_block.ref_external_temp) && parseFloat(dry_data_block.internal_temp) < parseFloat(dry_data_block.ref_internal_temp)) {
        //         set_heater(TURN_ON, TURN_ON, TURN_ON);
        //         set_stirrer(TURN_ON);
        //     }
        //     else {
        //         if(core_delay_count == 0) {
        //             set_heater(TURN_OFF, TURN_OFF, TURN_OFF);
        //             set_stirrer(TURN_ON);
        //         }
        //
        //         core_delay_count++;
        //         if(core_delay_count > 10) {
        //             core_delay_count = 0;
        //         }
        //     }
        //
        //     cur_weight = parseFloat(dry_data_block.cur_weight) - parseFloat(dry_data_block.pre_weight)
        //
        //     // EVENT_HEAT_COMPLETE
        //     if (cur_weight <= parseFloat(dry_data_block.tar_weight3) || dry_data_block.elapsed_time > (parseInt(dry_data_block.ref_elapsed_time)*60*60)) {
        //         dry_data_block.cum_weight += dry_data_block.ref_weight;
        //
        //         //console.log('heater 0');
        //
        //         dry_data_block.ref_weight = 0.0;
        //         dry_data_block.pre_weight = 0.0;
        //         dry_data_block.tar_weight1 = 0.0;
        //         dry_data_block.tar_weight2 = 0.0;
        //         dry_data_block.tar_weight3 = 0.0;
        //
        //         fs.writeFileSync('ddb.json', JSON.stringify(dry_data_block, null, 4), 'utf8');
        //
        //         dry_data_block.state = 'END';
        //         pre_state = '';
        //         print_lcd_state();
        //
        //         dry_data_block.my_sortie_name = 'disarm';
        //         send_to_Mobius(my_cnt_name, dry_data_block);
        //
        //         input_mode_delay_count = 0;
        //         contents_delay_count = 0;
        //         core_delay_count = 0;
        //
        //         set_heater(TURN_OFF, TURN_OFF, TURN_OFF);
        //         set_stirrer(TURN_OFF);
        //
        //         set_buzzer();
        //
        //         my_sortie_name = 'disarm';
        //         my_cnt_name = my_parent_cnt_name + '/' + my_sortie_name;
        //     }
        //     else {
        //         //console.log('heater3 ' + dry_data_block.cur_weight + ' ' + dry_data_block.tar_weight1 + ' ' + dry_data_block.tar_weight2 + ' ' + dry_data_block.tar_weight3);
        //         if(core_delay_count == 0) {
        //             set_heater(TURN_ON, TURN_ON, TURN_ON);
        //             set_stirrer(TURN_ON);
        //         }
        //
        //         core_delay_count++;
        //         if(core_delay_count > 50) {
        //             core_delay_count = 0;
        //         }
        //     }
        // }

        setTimeout(core_watchdog, normal_interval);
    }

    else if(dry_data_block.state == 'END') {
        // if(dryer_event & EVENT_START_BUTTON) {
        //     dryer_event &= ~EVENT_START_BUTTON;
        // }
        // else if(dryer_event & EVENT_START_BTN_LONG) {
        //     dryer_event &= ~EVENT_START_BTN_LONG;
        // }
        //     else if(dryer_event & EVENT_INPUT_DOOR_OPEN) {
        //         dryer_event &= ~EVENT_INPUT_DOOR_OPEN;
        //     }
        //     else if(dryer_event & EVENT_INPUT_DOOR_CLOSE) {
        //         dryer_event &= ~EVENT_INPUT_DOOR_CLOSE;
        //     }
        //     else if(dryer_event & EVENT_OUTPUT_DOOR_OPEN) {
        //         dryer_event &= ~EVENT_OUTPUT_DOOR_OPEN;
        //
        //         set_stirrer(TURN_ON);
        //     }
        //     else if(dryer_event & EVENT_OUTPUT_DOOR_CLOSE) {
        //         dryer_event &= ~EVENT_OUTPUT_DOOR_CLOSE;
        //
        //         set_stirrer(TURN_OFF);
        //     }
        //     else if(dryer_event & EVENT_SAFE_DOOR_OPEN) {
        //         dryer_event &= ~EVENT_SAFE_DOOR_OPEN;
        //     }
        //     else if(dryer_event & EVENT_SAFE_DOOR_CLOSE) {
        //         dryer_event &= ~EVENT_SAFE_DOOR_CLOSE;
        // }
        // else {
        //     if (dry_data_block.cum_weight < 2900) {
        //         set_heater(TURN_OFF, TURN_OFF, TURN_OFF);
        //         set_stirrer(TURN_OFF);
        //
        //         set_buzzer();
        //
        //         dry_data_block.state = 'INIT';
        //         pre_state = '';
        //         print_lcd_state();
        //
        //         dry_data_block.elapsed_time = 0;
        //
        //         // 스위치가 INPUT 모드로 되어 있다면
        //         set_heater(TURN_OFF, TURN_OFF, TURN_OFF);
        //         set_stirrer(TURN_OFF);
        //     }
        //     else {
        //         if (dry_data_block.cur_weight < 0.5) {
        //             set_heater(TURN_OFF, TURN_OFF, TURN_OFF);
        //             set_stirrer(TURN_OFF);
        //
        //             set_buzzer();
        //
        //             dry_data_block.state = 'INIT';
        //             pre_state = '';
        //             print_lcd_state();
        //
        //             dry_data_block.elapsed_time = 0;
        //
        //             // 스위치가 INPUT 모드로 되어 있다면
        //             set_heater(TURN_OFF, TURN_OFF, TURN_OFF);
        //             set_stirrer(TURN_OFF);
        //         }
        //         else {
        //             if (contents_delay_count == 0) {
        //                 dry_data_block.debug_message = 'Empty the contents';
        //                 pre_debug_message = '';
        //             }
        //
        //             contents_delay_count++;
        //             if (contents_delay_count > 40) {
        //                 contents_delay_count = 0;
        //             }
        //         }
        //     }
        // }

        setTimeout(core_watchdog, normal_interval);
    }

    else if(dry_data_block.state == 'DEBUG') {
        // if(dryer_event & EVENT_START_BUTTON) {
        //     dryer_event &= ~EVENT_START_BUTTON;
        //
        //     if(debug_mode_state == 'put_on_waiting') {
        //
        //         dry_data_block.debug_message = 'Calculating';
        //         pre_debug_message = '';
        //
        //         req_calc_factor();
        //     }
        // }
        // else if(dryer_event & EVENT_START_BTN_LONG) {
        //     dryer_event &= ~EVENT_START_BTN_LONG;
        // }
        // else if(dryer_event & EVENT_INPUT_DOOR_OPEN) {
        //     dryer_event &= ~EVENT_INPUT_DOOR_OPEN;
        // }
        // else if(dryer_event & EVENT_INPUT_DOOR_CLOSE) {
        //     dryer_event &= ~EVENT_INPUT_DOOR_CLOSE;
        // }
        // else if(dryer_event & EVENT_OUTPUT_DOOR_OPEN) {
        //     dryer_event &= ~EVENT_OUTPUT_DOOR_OPEN;
        // }
        // else if(dryer_event & EVENT_OUTPUT_DOOR_CLOSE) {
        //     dryer_event &= ~EVENT_OUTPUT_DOOR_CLOSE;
        // }
        // else if(dryer_event & EVENT_SAFE_DOOR_OPEN) {
        //     dryer_event &= ~EVENT_SAFE_DOOR_OPEN;
        // }
        // else if(dryer_event & EVENT_SAFE_DOOR_CLOSE) {
        //     dryer_event &= ~EVENT_SAFE_DOOR_CLOSE;
        // }
        // else {
        //     if (dry_data_block.debug_mode == 0) {
        //         set_heater(TURN_OFF, TURN_OFF, TURN_OFF);
        //         set_stirrer(TURN_OFF);
        //
        //         set_buzzer();
        //
        //         console.log(dry_data_block.state);
        //         dry_data_block.state = 'INPUT';
        //         pre_state = '';
        //         print_lcd_state();
        //         console.log('->' + dry_data_block.state);
        //
        //         dry_data_block.debug_message = ' ';
        //         pre_debug_message = '';
        //
        //         dry_data_block.elapsed_time = 0;
        //
        //         pre_cur_weight = 9999;
        //     }
        //     else {
        //         if (debug_mode_state == 'start') {
        //             console.log("Start zero point");
        //
        //             dry_data_block.debug_message = 'Start zero point';
        //             pre_debug_message = '';
        //
        //             req_zero_point();
        //
        //             debug_mode_state = 'start_waiting';
        //
        //             setTimeout(core_watchdog, normal_interval);
        //         }
        //         else if (debug_mode_state == 'put_on') {
        //             dry_data_block.debug_message = 'Put weight on - ' + dry_data_block.loadcell_ref_weight;
        //             pre_debug_message = '';
        //
        //             debug_mode_state = 'put_on_waiting';
        //
        //             setTimeout(core_watchdog, normal_interval);
        //         }
        //         else if (debug_mode_state == 'complete') {
        //             dry_data_block.debug_message = 'Complete zero point';
        //             pre_debug_message = '';
        //
        //             debug_mode_state = 'completed';
        //
        //             var obj = {};
        //             obj.loadcell_factor = dry_data_block.loadcell_factor;
        //             obj.correlation_value = dry_data_block.correlation_value;
        //             send_to_Mobius(zero_mission_name, obj);
        //         }
        //         else {
        //         }
        //     }
        // }

        setTimeout(core_watchdog, normal_interval);
    }

    else if(dry_data_block.state == 'EXCEPTION') {
        // if(dryer_event & EVENT_START_BUTTON) {
        //     dryer_event &= ~EVENT_START_BUTTON;
        // }
        // else if(dryer_event & EVENT_START_BTN_LONG) {
        //     dryer_event &= ~EVENT_START_BTN_LONG;
        // }
        // else if(dryer_event & EVENT_INPUT_DOOR_OPEN) {
        //     dryer_event &= ~EVENT_INPUT_DOOR_OPEN;
        //
        //     dry_data_block.debug_message = 'Close input door';
        //     pre_debug_message = '';
        //     set_buzzer();
        // }
        // else if(dryer_event & EVENT_INPUT_DOOR_CLOSE) {
        //     dryer_event &= ~EVENT_INPUT_DOOR_CLOSE;
        //
        //     dry_data_block.debug_message = ' ';
        //     pre_debug_message = '';
        // }
        // else if(dryer_event & EVENT_OUTPUT_DOOR_OPEN) {
        //     dryer_event &= ~EVENT_OUTPUT_DOOR_OPEN;
        //
        //     dry_data_block.debug_message = 'Close output door';
        //     pre_debug_message = '';
        //     set_buzzer();
        // }
        // else if(dryer_event & EVENT_OUTPUT_DOOR_CLOSE) {
        //     dryer_event &= ~EVENT_OUTPUT_DOOR_CLOSE;
        //
        //     dry_data_block.debug_message = ' ';
        //     pre_debug_message = '';
        // }
        // else if(dryer_event & EVENT_SAFE_DOOR_OPEN) {
        //     dryer_event &= ~EVENT_SAFE_DOOR_OPEN;
        //
        //     dry_data_block.debug_message = 'Close safe door';
        //     pre_debug_message = '';
        //     set_buzzer();
        // }
        // else if(dryer_event & EVENT_SAFE_DOOR_CLOSE) {
        //     dryer_event &= ~EVENT_SAFE_DOOR_CLOSE;
        //
        //     dry_data_block.debug_message = ' ';
        //     pre_debug_message = '';
        // }
        // else {
        // if (dry_data_block.operation_mode == 1) {
        //     if(input_mode_delay_count == 0) {
        //         dry_data_block.debug_message = 'Choose an INPUT mode';
        //         pre_debug_message = '';
        //         set_buzzer();
        //     }
        //
        //     input_mode_delay_count++;
        //     if(input_mode_delay_count > 40) {
        //         input_mode_delay_count = 0;
        //     }
        // }
        // else {
        //     dry_data_block.pre_weight = dry_data_block.cur_weight;
        //
        //     fs.writeFileSync('ddb.json', JSON.stringify(dry_data_block, null, 4), 'utf8');
        //
        //     input_mode_delay_count = 0;
        //     contents_delay_count = 0;
        //
        //     console.log(dry_data_block.state);
        //     dry_data_block.state = 'INPUT';
        //     pre_state = '';
        //     print_lcd_state();
        //     console.log('->' + dry_data_block.state);
        //
        //     dry_data_block.my_sortie_name = 'disarm';
        //     send_to_Mobius(my_cnt_name, dry_data_block);
        //
        //     my_sortie_name = 'disarm';
        //     my_cnt_name = my_parent_cnt_name + '/' + my_sortie_name;
        //
        //     set_heater(TURN_OFF, TURN_OFF, TURN_OFF);
        //     set_stirrer(TURN_OFF);
        //
        //     set_buzzer();
        // }
        // }

        setTimeout(core_watchdog, normal_interval);
    }

    else {
        setTimeout(core_watchdog, normal_interval);
    }

    //console.log('core watchdog');
}*/

///////////////////////////////////////////////////////////////////////////////

setTimeout(food_watchdog, 1000);

function food_watchdog(){
    //100ms동작
    //실시간으로 변경되는 상태값 저장

    internal_temp_timer = setTimeout(req_internal_temp, 1500);
    input_door_timer = setTimeout(req_input_door, 250);
    //output_door_timer = setTimeout(req_output_door, parseInt(Math.random()*10));
    //safe_door_timer = setTimeout(req_safe_door, parseInt(Math.random()*10));
    weight_timer = setTimeout(req_weight, 1500);
    //operation_mode_timer = setTimeout(req_operation_mode, parseInt(Math.random()*10));
    //debug_mode_timer = setTimeout(req_debug_mode, parseInt(Math.random()*10));
    //start_btn_timer = setTimeout(req_start_btn, parseInt(Math.random()*10));

    //console.log('food watchdog');
}

var func = {};
func['res_zero_point'] = res_zero_point;
func['res_calc_factor'] = res_calc_factor;
func['res_internal_temp'] = res_internal_temp;
func['res_input_door'] = res_input_door;
// func['res_output_door'] = res_output_door;
// func['res_safe_door'] = res_safe_door;
func['res_weight'] = res_weight;
func['res_operation_mode'] = res_operation_mode;
func['res_debug_mode'] = res_debug_mode;
func['res_start_btn'] = res_start_btn;
