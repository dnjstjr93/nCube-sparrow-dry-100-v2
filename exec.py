import sys, os, time, json
import paho.mqtt.client as mqtt
import MAX6675
from hx711 import HX711
import SX1509
import Control
import datetime
import board, busio
import adafruit_character_lcd.character_lcd_i2c as character_lcd
import RPi.GPIO as GPIO

g_res_event = 0x00

RES_TEMPERATURE = 0x01
RES_WEIGHT = 0x02
RES_ZERO_POINT = 0x04
RES_CALC_FACTOR = 0x08
SET_ZERO_POINT = 0x10


g_set_event = 0x00

SET_FAN = 0x01
SET_HEATER = 0x02
SET_STIRRER = 0x04
SET_LIFT = 0x08
SET_CRUSHER = 0x10
SET_CLEANING_PUMP = 0x20


# g_buzzer_event = 0x00
#
# SET_BUZZER = 0x01
#
#
# g_print_event = 0x00
#
# LCD_DEBUG = 0x01
# LCD_INPUT_DOOR = 0x02
# LCD_OUTPUT_DOOR = 0x04
# LCD_SAFE_DOOR = 0x08
# LCD_TEMPERATURE = 0X10
# LCD_STATE = 0x20
# LCD_LOADCELL = 0x40
# LCD_LOADCELL_FACTOR = 0x80
#
# g_print_event_2 = 0x00
#
# LCD_ELAPSED_TIME = 0x01


g_res_internal_temp = {}
g_res_weight = {}
g_res_zero_point = {}
g_res_calc_factor = {}
g_set_zero_point = 0.0

g_set_fan_val = {}
g_set_heat_val = {}
g_set_stirrer_val = {}
g_set_lift_val = {}
g_set_crusher_val = {}
g_set_cleaning_pump_val = {}

# g_set_buzzer_val = 0
#
# g_print_debug = ''
# g_print_input_door = 0
# g_print_output_door = 0
# g_print_safe_door = 0
# g_print_internal_temp = 0
# g_print_external_temp = 0
# g_print_state = ''
# g_print_loadcell = ''
# g_print_target_loadcell = ''
# g_print_loadcell_factor = 0
# g_print_corr_val = 0
# g_print_elapsed_time = ''

'''
heater temperature = top_temp = internal_temp
stirrer temperature = bottom_temp = external_temp
'''
avg_bottom_temp = 0.0
avg_top_temp = 0.0
bottom_temp_arr = [0,0,0,0,0]
top_temp_arr = [0,0,0,0,0]

hx = 0
#nWeightCount = 1
arr_count = 5
weight_arr = [0, 0, 0, 0, 0]
flag = 0

zero_weight = 0.0 # Only case weight
req_zero_ref_weight = 0.0 # reference weight = 1.2
get_correlation_value = 0.0
get_factor = 0.0

#---Parse Data----------------------------------------------------------
def json_to_val(json_val):
	payloadData = json.loads(json_val)

	if (len(payloadData) == 1):
		val = payloadData['val']
		return (val)
	elif (len(payloadData) == 2):
		val = payloadData['val']
		val2 = payloadData['val2']
		return (val, val2)
	elif (len(payloadData) == 3):
		val = payloadData['val']
		val2 = payloadData['val2']
		val3 = payloadData['val3']
		return (val, val2, val3)

def val_to_json(val,val2=None):
	if (val2 != None):
		json_val = {"val":val,"val2":val2}
	else:
		json_val = {"val":val}
	json_val = json.dumps(json_val)

	return (json_val)
#-----------------------------------------------------------------------

#---SET Pin-------------------------------------------------------------
# Load Cell (Direct)
HX711_DAT = 6
HX711_CLK = 7

'''
heater temperature = top_temp = internal_temp
stirrer temperature = bottom_temp = external_temp
'''
# Temperature 1 Top
CLK1 = 17 #
CS1  = 26 #
SO1  = 27 #
# Temperature 2 Bottom
CLK2 = 39 #
CS2  = 40 #
SO2  = 41 #

# Temperature
sensor1 = MAX6675.MAX6675(CLK1, CS1, SO1)
sensor2 = MAX6675.MAX6675(CLK2, CS2, SO2)

# Digital IN
Input_Door_pin = 0
Output_Door_pin = 1
Safe_Door_pin = 2

# Switch
Start_btn_pin = 3
Debug_switch_pin = 4

# Digital OUT
TPR_pin = 6
Heater_pin = 7
Stirrer_pin = 8
Lift_pin = 9
Lift2_pin = 10
Crusher_pin = 11
Cleaning_Pump_pin = 12
Circulator_pin = 13
Cooling_Fan_pin = 13
Pump_pin = 13

#---SET SX1509----------------------------------------------------------
addr = 0x3e
sx = SX1509.SX1509(addr)
ctl = Control.Control(sx)

# #---Buzzer--------------------------------------------------------------
# Buzzer_pin = 11 # Direct Connect
#
# GPIO.setmode(GPIO.BCM)
# GPIO.setup(Buzzer_pin, GPIO.OUT)
#
# #---LCD I2C-------------------------------------------------------------
# SDA = 38 # SDA_LCD-DAT
# SCL = 16 # SCL_LCD-CLK
#=======================================================================

#---GET Temperature-----------------------------------------------------
def get_temp():
	'''
	heater temperature = top_temp = internal_temp
	stirrer temperature = bottom_temp = external_temp
	'''
	global avg_bottom_temp, avg_top_temp
	global arr_count
	global bottom_temp_arr, top_temp_arr
	
	top_temp = round(sensor1.readTempC(), 1)
	bottom_temp = round(sensor2.readTempC(), 1)

	for i in range(arr_count):
		if (i > 0):
			bottom_temp_arr[i-1] = bottom_temp_arr[i]
			top_temp_arr[i-1] = top_temp_arr[i]
		bottom_temp_arr[arr_count-1] = bottom_temp
		top_temp_arr[arr_count-1] = top_temp

	avg_bottom_temp = round((sum(bottom_temp_arr) / arr_count), 1)
	avg_top_temp = round((sum(top_temp_arr) / arr_count), 1)

	temperature = val_to_json(avg_top_temp, avg_bottom_temp)

	return (temperature)
#=======================================================================

#===Load Cell===========================================================
#---SET Load Cell & GET Weight------------------------------------------
def cleanAndExit():
    print("Cleaning...")

    if not EMULATE_HX711:
        GPIO.cleanup()

    print("Bye!")
    sys.exit()


def init_loadcell(referenceUnit = 1):
	global hx

	hx = HX711(HX711_DAT, HX711_CLK)
	hx.set_reading_format("MSB", "MSB")
	hx.set_reference_unit(referenceUnit)
	hx.reset()


def set_factor(referenceUnit):
	init_loadcell(referenceUnit)

def get_loadcell():
	global hx
	global flag
	global weight_arr
	global arr_count
	global get_factor
	global get_correlation_value
	
	try:
		if (flag == 0):
			for i in range(arr_count):
				weight = hx.get_weight(5)
				weight_arr[i] = weight
				flag = 1
		else:
			weight = hx.get_weight(5)
			for i in range(arr_count):
				if (i > 0):
					weight_arr[i-1] = weight_arr[i]
				weight_arr[arr_count-1] = weight

		avg_weight = round((sum(weight_arr) / arr_count), 1)
		final_weight = avg_weight - get_correlation_value
		final_weight = max(0, float(final_weight))
		print("GET : weight_arr: ",weight_arr)
		print("GET : avg_weight: ",avg_weight)
		print("GET : get_factor: ",get_factor)
		print("GET : get_correlation_value: ",get_correlation_value)
		print("GET : final_weight: ",final_weight)
		weight_json = val_to_json(final_weight)

	except (KeyboardInterrupt, SystemExit):
		cleanAndExit()
		set_factor(get_factor)

	return (weight_json)

def ref_weight(tare_weight):
	'''
	When the factor is 1 and the reference weight is removed, only the case
	weight is measured.
	variable : zero_weight
	'''

	global hx
	global zero_weight

	val = val_to_json(1)

	init_loadcell(1)

	zero_weight = hx.get_weight(5)

	print("Add weight for initialize...")

	return val

def calc_ref_Unit(reference_weight, default_Unit=1):
	'''
	Measures to the reference weight + case weight when factor is 1.
	(Variable : ref_weight_total)

	Calculate the weight of the reference weight minus the case weight and
	divide by the reference weight to get the factor.
	(Variable : get_factor)

	Apply get_factor to get the weight and subtract the reference weight to
	calculate correlation value.
	correlation value is a variable for precisely calculating the weight.
	(Variable : get_correlation_value)
	'''

	global hx
	global get_correlation_value
	global zero_weight
	global get_factor
	global get_correlation_value

	ref_weight_total = hx.get_weight(5)

	print('calc_ref_Unit : avg_ref_weight: ', ref_weight_total)
	cur_weight = (ref_weight_total - zero_weight)
	get_factor = (cur_weight / reference_weight)
	print('calc_ref_Unit : cur_weight = {} - {} = {}'.format(ref_weight_total, zero_weight, cur_weight))
	print('calc_ref_Unit : get_factor = {} / {} = {}'.format(cur_weight, reference_weight, get_factor))

	if (abs(get_factor) < 1.0):
		get_factor = default_Unit

	hx.set_reference_unit(get_factor)
	hx.reset()

	factor_weight_total = hx.get_weight(5)

	get_correlation_value = factor_weight_total - reference_weight
	factor = {"factor":get_factor, "correlation_value":get_correlation_value}
	print('calc_ref_Unit : avg_factor_weight: ', factor_weight_total)
	print('calc_ref_Unit : correlation_value: ', get_correlation_value)
	with open ("./factor.json", "w") as factor_json:
		json.dump(factor, factor_json)

	print("Complete!")

	calc_ref_unit = val_to_json(get_factor, get_correlation_value)

	return calc_ref_unit
#-----------------------------------------------------------------------

def save_factor():
	global get_factor
	global get_correlation_value
	
	loadcell_param = {"factor":6555,"correlation_value":0.1}

	if (os. path.isfile("./factor.json") == False):
		with open("./factor.json","w") as refUnit_json:
			json.dump(loadcell_param, refUnit_json)
		get_factor = loadcell_param['factor']
		get_correlation_value = loadcell_param['correlation_value']
	else:
		refUnit_json = open("./factor.json").read()
		data = json.loads(refUnit_json)
	
		get_factor = data['factor']
		get_correlation_value = data['correlation_value']
	print("save_factor:", get_factor,", ", get_correlation_value)
	
	return get_factor, get_correlation_value
#=======================================================================

#===SET=================================================================
#---Heater--------------------------------------------------------------
def heater(val):
	print('heater value: ', val)
	ctl.DOUT(TPR_pin,1)
	for i in range(1000):
		continue
	ctl.DOUT(TPR_pin,0)
	ctl.DOUT(Heater_pin,val)

#---Stirrer-------------------------------------------------------------
def stirrer(val):
	print('stirrer value: ', val)
	ctl.DOUT(Stirrer_pin,val)

#---Lift----------------------------------------------------------------
def lift(val):
	print('lift value: ', val)

	if (val == -1):
		ctl.DOUT(Lift_pin,1)
		ctl.DOUT(Lift2_pin,0)
	elif (val == 1):
		ctl.DOUT(Lift_pin,0)
		ctl.DOUT(Lift2_pin,0)
	elif (val == 0):
		ctl.DOUT(Lift_pin,0)
		ctl.DOUT(Lift2_pin,1)

#---Crusher-------------------------------------------------------------
def crusher(val):
	print('crusher value: ', val)

	ctl.DOUT(Crusher_pin,val)

#---Cooling_Fan---------------------------------------------------------
def cooling_fan(val):
	print('cooling_fan value: ', val)

	ctl.DOUT(Cooling_Fan_pin,val)

#---Cleaning_Pump-------------------------------------------------------
def cleaning_pump(val):
	print('cleaning_pump value: ', val)

	ctl.DOUT(Cleaning_Pump_pin,val)
#=======================================================================

'''
#---Buzzer--------------------------------------------------------------
def buzzer(val):
	freq = [1936, 2094, 1760]#[988, 1047, 880]

	try:
		p = GPIO.PWM(Buzzer_pin, 600)
		p.start(50)

		for i in range(len(freq)):
			p.ChangeFrequency(freq[i])
			time.sleep(0.23)

		p.stop()
		time.sleep(0.4)
		p.start(50)

		for i in range(len(freq)):
			p.ChangeFrequency(freq[i])
			time.sleep(0.23)

		p.stop()

	except KeyboardInterrupt:
		GPIO.cleanup()
#-----------------------------------------------------------------------

#---INIT LCD & Display Message------------------------------------------
def lcd_init():
	lcd_columns = 20
	lcd_rows = 4

	i2c = busio.I2C(board.SCL, board.SDA)

	lcd = character_lcd.Character_LCD_I2C(i2c, lcd_columns, lcd_rows)
	lcd.backlight = True

	return lcd


def displayState(msg1):
	prev_state = '      '
	g_lcd.cursor_position(0,0)
	g_lcd.message = f'{prev_state}'
	try:
		if (msg1 == 'DEBUG'):
			g_lcd.clear()
		elif(msg1 == 'TARGETING'):
			msg1 = 'TARGET'
		elif(msg1 == 'EXCEPTION'):
			msg1 = 'EXCEPT'
		g_lcd.cursor_position(0,0)
		message = '       '
		g_lcd.message = message
		g_lcd.cursor_position(0,0)
		g_lcd.message = f'{msg1}'

	except OSError:
		lcd_init()
		if (msg1 == 'DEBUG'):
			g_lcd.clear()
		elif(msg1 == 'TARGETING'):
			msg1 = 'TARGET'
		elif(msg1 == 'EXCEPTION'):
			msg1 = 'EXCEPT'
		g_lcd.cursor_position(0,0)
		message = '       '
		g_lcd.message = message
		g_lcd.cursor_position(0,0)
		g_lcd.message = f'{msg1}'


def displayTemp(msg1, msg2):
	print("Temperature: ", msg1, ", ", msg2)
	if (len(str(msg1)) > 5):
		msg1 = str(msg1)
		msg1 = msg1[0:5]
	elif (len(str(msg2)) > 5):
		msg2 = str(msg2)
		msg2 = msg2[0:5]
	try:
		g_lcd.cursor_position(8,0)
		message = '     '
		g_lcd.message = message
		g_lcd.cursor_position(8,0)
		g_lcd.message = f'{msg1}'
		g_lcd.cursor_position(14,0)
		message = '     '
		g_lcd.message = message
		g_lcd.cursor_position(14,0)
		g_lcd.message = f'{msg2}'

	except OSError:
		lcd_init()
		g_lcd.cursor_position(8,0)
		message = '     '
		g_lcd.message = message
		g_lcd.cursor_position(8,0)
		g_lcd.message = f'{msg1}'
		g_lcd.cursor_position(14,0)
		message = '     '
		g_lcd.message = message
		g_lcd.cursor_position(14,0)
		g_lcd.message = f'{msg2}'



def displayLoadcell(msg1, msg2):
	print("LoadCell: ", msg1, ", ", msg2)
	if (len(str(msg1)) > 5):
		msg1 = str(msg1)
		msg1 = msg1[0:5]
	elif (len(str(msg2)) > 5):
		msg2 = str(msg2)
		msg2 = msg2[0:5]
	try:
		g_lcd.cursor_position(0,1)
		message = '          '
		g_lcd.message = message
		g_lcd.cursor_position(0,1)
		g_lcd.message = f'{msg1}'

		g_lcd.cursor_position(10,1)
		message = '          '
		g_lcd.message = message
		g_lcd.cursor_position(10,1)
		g_lcd.message = f'{msg2}'

	except OSError:
		lcd_init()
		g_lcd.cursor_position(0,1)
		message = '          '
		g_lcd.message = message
		g_lcd.cursor_position(0,1)
		g_lcd.message = f'{msg1}'

		g_lcd.cursor_position(10,1)
		message = '          '
		g_lcd.message = message
		g_lcd.cursor_position(10,1)
		g_lcd.message = f'{msg2}'


def displayLoadcellFactor(msg1):
	if (len(str(msg1)) > 6):
		msg1 = str(msg1)
		msg1 = msg1[0:6]

	try:
		g_lcd.cursor_position(13,1)
		message = '      '
		g_lcd.message = message
		g_lcd.cursor_position(13,1)
		g_lcd.message = f'{msg1}'

	except OSError:
		lcd_init()
		g_lcd.cursor_position(13,1)
		message = '      '
		g_lcd.message = message
		g_lcd.cursor_position(13,1)
		g_lcd.message = f'{msg1}'


def displayInputDoor(msg1):
	if (len(str(msg1)) > 1):
		msg1 = str(msg1)
		msg1 = msg1[0:1]
	try:
		g_lcd.cursor_position(15,2)
		message = ' '
		g_lcd.message = message
		g_lcd.cursor_position(15,2)
		g_lcd.message = f'{msg1}'
	except OSError:
		lcd_init()
		g_lcd.cursor_position(15,2)
		message = ' '
		g_lcd.message = message
		g_lcd.cursor_position(15,2)
		g_lcd.message = f'{msg1}'


def displayOutputDoor(msg1):
	if (len(str(msg1)) > 1):
		msg1 = str(msg1)
		msg1 = msg1[0:1]
	try:

		g_lcd.cursor_position(17,2)
		message = ' '
		g_lcd.message = message
		g_lcd.cursor_position(17,2)
		g_lcd.message = f'{msg1}'
	except OSError:
		lcd_init()
		g_lcd.cursor_position(17,2)
		message = ' '
		g_lcd.message = message
		g_lcd.cursor_position(17,2)
		g_lcd.message = f'{msg1}'


def displaySafeDoor(msg1):
	if (len(str(msg1)) > 1):
		msg1 = str(msg1)
		msg1 = msg1[0:1]
	try:
		g_lcd.cursor_position(19,2)
		message = ' '
		g_lcd.message = message
		g_lcd.cursor_position(19,2)
		g_lcd.message = f'{msg1}'
	except OSError:
		lcd_init()
		g_lcd.cursor_position(19,2)
		message = ' '
		g_lcd.message = message
		g_lcd.cursor_position(19,2)
		g_lcd.message = f'{msg1}'


def displayElapsed(msg1):
	if (len(str(msg1)) > 8):
		msg1 = str(msg1)
		msg1 = msg1[0:8]
	try:
		g_lcd.cursor_position(0,2)
		message = '       '
		g_lcd.message = message
		g_lcd.cursor_position(0,2)
		g_lcd.message = f'{msg1}'
	except OSError:
		lcd_init()
		g_lcd.cursor_position(0,2)
		message = '       '
		g_lcd.message = message
		g_lcd.cursor_position(0,2)
		g_lcd.message = f'{msg1}'


def displayMsg(msg1):
	if (len(str(msg1)) > 20):
		msg1 = str(msg1)
		msg1 = msg1[0:20]
	try:
		g_lcd.cursor_position(0,3)
		message = '                    '
		g_lcd.message = message
		g_lcd.cursor_position(0,3)
		g_lcd.message = f'{msg1}'

	except OSError:
		lcd_init()
		g_lcd.cursor_position(0,3)
		message = '                    '
		g_lcd.message = message
		g_lcd.cursor_position(0,3)
		g_lcd.message = f'{msg1}'
#-----------------------------------------------------------------------
'''

#---MQTT----------------------------------------------------------------
def on_connect(client,userdata,flags, rc):
	print('[dry_mqtt_connect] connect to ', broker_address)
	dry_client.subscribe("/req_internal_temp")
	dry_client.subscribe("/req_weight")
	dry_client.subscribe("/req_zero_point")
	dry_client.subscribe("/req_calc_factor")
	dry_client.subscribe("/set_zero_point")
	dry_client.subscribe("/set_fan")
	dry_client.subscribe("/set_heater")
	dry_client.subscribe("/set_stirrer")
	dry_client.subscribe("/set_lift")
	dry_client.subscribe("/set_crusher")
	dry_client.subscribe("/set_cleaning_pump")
	#dry_client.subscribe("/set_buzzer")
	#dry_client.subscribe("/print_lcd_internal_temp")
	#dry_client.subscribe("/print_lcd_state")
	#dry_client.subscribe("/print_lcd_debug_message")
	#dry_client.subscribe("/print_lcd_loadcell")
	#dry_client.subscribe("/print_lcd_loadcell_factor")
	#dry_client.subscribe("/print_lcd_elapsed_time")
	#dry_client.subscribe("/print_lcd_input_door")
	#dry_client.subscribe("/print_lcd_output_door")
	#dry_client.subscribe("/print_lcd_safe_door")

def on_disconnect(client, userdata, flags, rc=0):
	print(str(rc))


def on_subscribe(client, userdata, mid, granted_qos):
	print("subscribed: " + str(mid) + " " + str(granted_qos))


def on_message(client, userdata, _msg):
    global g_res_event
    global g_res_internal_temp
    global g_res_weight
    global g_res_zero_point
    global g_res_calc_factor
    global g_set_zero_point

    global req_zero_ref_weight
    global get_factor
    global get_correlation_value    

    global g_set_event
    global g_set_fan_val
    global g_set_heat_val
    global g_set_stirrer_val
    global g_set_lift_val
    global g_set_crusher_val
    global g_set_cleaning_pump_val
    
#     global g_buzzer_event
#     global g_set_buzzer_val
#
#     global g_print_event
#     global g_print_event_2
#     global g_print_debug
#     global g_print_input_door
#     global g_print_output_door
#     global g_print_safe_door
#     global g_print_internal_temp
#     global g_print_external_temp
#     global g_print_state
#     global g_print_loadcell
#     global g_print_target_loadcell
#     global g_print_loadcell_factor
#     global g_print_corr_val
#     global g_print_elapsed_time

    correlation_value = loadcell_corr_val

    if _msg.topic == '/req_internal_temp':
        g_res_event |= RES_TEMPERATURE

    elif _msg.topic == '/req_zero_point':
        data = _msg.payload.decode('utf-8').replace("'", '"')
        req_zero_reference_weight = json.loads(data)
        req_zero_ref_weight = req_zero_reference_weight['val']
        g_res_event |= RES_ZERO_POINT

    elif _msg.topic == '/req_calc_factor':
        g_res_event |= RES_CALC_FACTOR

    elif _msg.topic == '/req_weight':
        g_res_event |= RES_WEIGHT

    elif _msg.topic == '/set_zero_point':
        get_factor, get_correlation_value = save_factor()
        g_res_event |= SET_ZERO_POINT


    if _msg.topic == '/set_fan':
        data = _msg.payload.decode('utf-8').replace("'", '"')
        g_set_fan_val = json_to_val(data)
        g_set_event |= SET_FAN

    elif _msg.topic == '/set_heater':
        data = _msg.payload.decode('utf-8').replace("'", '"')
        g_set_heat_val = json_to_val(data)
        g_set_event |= SET_HEATER

    elif _msg.topic == '/set_stirrer':
        data = _msg.payload.decode('utf-8').replace("'", '"')
        g_set_stirrer_val = json_to_val(data)
        g_set_event |= SET_STIRRER

    elif _msg.topic == '/set_lift':
        data = _msg.payload.decode('utf-8').replace("'", '"')
        g_set_lift_val = json_to_val(data)
        g_set_event |= SET_LIFT

    elif _msg.topic == '/set_crusher':
        data = _msg.payload.decode('utf-8').replace("'", '"')
        g_set_crusher_val = json_to_val(data)
        g_set_event |= SET_CRUSHER

    elif _msg.topic == '/set_cleaning_pump':
        data = _msg.payload.decode('utf-8').replace("'", '"')
        g_set_cleaning_pump_val = json_to_val(data)
        g_set_event |= SET_CLEANING_PUMP


#     if _msg.topic == '/set_buzzer':
#         data = _msg.payload.decode('utf-8').replace("'", '"')
#         g_set_buzzer_val = json_to_val(data)
#         g_buzzer_event |= SET_BUZZER
#
#
#     if _msg.topic == '/print_lcd_debug_message':
#         data = _msg.payload.decode('utf-8').replace("'", '"')
#         g_print_debug = json_to_val(data)
#         g_print_event |= LCD_DEBUG
#
#     elif _msg.topic == '/print_lcd_input_door':
#         data = _msg.payload.decode('utf-8').replace("'", '"')
#         g_print_input_door = json_to_val(data)
#         g_print_event |= LCD_INPUT_DOOR
#
#     elif _msg.topic == '/print_lcd_output_door':
#         data = _msg.payload.decode('utf-8').replace("'", '"')
#         g_print_output_door = json_to_val(data)
#         g_print_event |= LCD_OUTPUT_DOOR
#
#     elif _msg.topic == '/print_lcd_safe_door':
#         data = _msg.payload.decode('utf-8').replace("'", '"')
#         g_print_safe_door = json_to_val(data)
#         g_print_event |= LCD_SAFE_DOOR
#
#     elif _msg.topic == '/print_lcd_internal_temp':
#         data = _msg.payload.decode('utf-8').replace("'", '"')
#         g_print_internal_temp, g_print_external_temp = json_to_val(data)
#         g_print_event |= LCD_TEMPERATURE
#
#     elif _msg.topic == '/print_lcd_state':
#         data = _msg.payload.decode('utf-8').replace("'", '"')
#         g_print_state = json_to_val(data)
#         g_print_event |= LCD_STATE
#
#     elif _msg.topic == '/print_lcd_loadcell':
#         data = _msg.payload.decode('utf-8').replace("'", '"')
#         loadcell, target_loadcell = json_to_val(data)
#         g_print_loadcell = str(loadcell)
#         g_print_target_loadcell = str(target_loadcell)
#         g_print_event |= LCD_LOADCELL
#
#     elif _msg.topic == '/print_lcd_loadcell_factor':
#         data = _msg.payload.decode('utf-8').replace("'", '"')
#         g_print_loadcell_factor, g_print_corr_val = json_to_val(data)
#         g_print_event |= LCD_LOADCELL_FACTOR
#
#     elif _msg.topic == '/print_lcd_elapsed_time':
#         data = _msg.payload.decode('utf-8').replace("'", '"')
#         elapsed_time = json_to_val(data)
#         g_print_elapsed_time = str(datetime.timedelta(seconds=elapsed_time))
#         g_print_event_2 |= LCD_ELAPSED_TIME

#-----------------------------------------------------------------------

#=======================================================================
global dry_client
broker_address = "localhost"
port = 1883

dry_client = mqtt.Client()
dry_client.on_connect = on_connect
dry_client.on_disconnect = on_disconnect
dry_client.on_subscribe = on_subscribe
dry_client.on_message = on_message
dry_client.connect(broker_address, port)

# dry_client.subscribe("/set_buzzer")
# dry_client.subscribe("/print_lcd_internal_temp")
# dry_client.subscribe("/print_lcd_state")
# dry_client.subscribe("/print_lcd_debug_message")
# dry_client.subscribe("/print_lcd_loadcell")
# dry_client.subscribe("/print_lcd_loadcell_factor")
# dry_client.subscribe("/print_lcd_elapsed_time")
# dry_client.subscribe("/print_lcd_input_door")
# dry_client.subscribe("/print_lcd_output_door")
# dry_client.subscribe("/print_lcd_safe_door")

dry_client.loop_start()

loadcell_factor, loadcell_corr_val = save_factor()
init_loadcell(loadcell_factor)

# global g_lcd
# g_lcd = lcd_init()

def core_func():
	period = 20000
	while_count = 0

	global g_res_event
	global g_res_internal_temp
	global g_res_weight
	global g_res_zero_point
	global g_res_calc_factor
	global g_set_zero_point

	global req_zero_ref_weight
	global get_factor
	global get_correlation_value

	referenceUnit = 1

	global g_set_event
	global g_set_fan_val
	global g_set_heat_val
	global g_set_stirrer_val
	global g_set_lift_val
	global g_set_crusher_val
	global g_set_cleaning_pump_val

# 	global g_buzzer_event
# 	global g_set_buzzer_val
#
# 	global g_print_event
# 	global g_print_event_2
# 	global g_print_debug
# 	global g_print_input_door
# 	global g_print_output_door
# 	global g_print_safe_door
# 	global g_print_internal_temp
# 	global g_print_external_temp
# 	global g_print_state
# 	global g_print_loadcell
# 	global g_print_target_loadcell
# 	global g_print_loadcell_factor
# 	global g_print_corr_val
# 	global g_print_elapsed_time

	while True:
		if g_res_event & RES_TEMPERATURE:
			g_res_event &= (~RES_TEMPERATURE)
			g_res_internal_temp = get_temp()
			dry_client.publish("/res_internal_temp", g_res_internal_temp)

		elif g_res_event & RES_ZERO_POINT:
			g_res_event &= (~RES_ZERO_POINT)
			g_res_zero_point = ref_weight(req_zero_ref_weight)
			dry_client.publish("/res_zero_point", g_res_zero_point)

		elif g_res_event & RES_CALC_FACTOR:
			g_res_event &= (~RES_CALC_FACTOR)
			g_res_calc_factor = calc_ref_Unit(req_zero_ref_weight)
			dry_client.publish("/res_calc_factor", g_res_calc_factor)

		elif g_res_event & RES_WEIGHT:
			g_res_event &= (~RES_WEIGHT)
			g_res_weight = get_loadcell()
			dry_client.publish("/res_weight", g_res_weight)

		elif g_res_event & SET_ZERO_POINT:
			g_res_event &= (~SET_ZERO_POINT)
			set_factor(get_factor)


		elif g_set_event & SET_FAN:
			g_set_event &= (~SET_FAN)
			cooling_fan(g_set_fan_val)
		elif g_set_event & SET_HEATER:
			g_set_event &= (~SET_HEATER)
			heater(g_set_heat_val)
		elif g_set_event & SET_STIRRER:
			g_set_event &= (~SET_STIRRER)
			stirrer(g_set_stirrer_val)
		elif g_set_event & SET_LIFT:
			g_set_event &= (~SET_LIFT)
			lift(g_set_lift_val)
		elif g_set_event & SET_CRUSHER:
			g_set_event &= (~SET_CRUSHER)
			crusher(g_set_crusher_val)
		elif g_set_event & SET_CLEANING_PUMP:
			g_set_event &= (~SET_CLEANING_PUMP)
			cleaning_pump(g_set_cleaning_pump_val)


# 		if g_buzzer_event & SET_BUZZER:
# 			g_buzzer_event &= (~SET_BUZZER)
# 			buzzer(g_set_buzzer_val)
#
#
# 		if g_print_event & LCD_DEBUG:
# 			g_print_event &= (~LCD_DEBUG)
# 			displayMsg(g_print_debug)
#
# 		elif g_print_event & LCD_INPUT_DOOR:
# 			g_print_event &= (~LCD_INPUT_DOOR)
# 			displayInputDoor(g_print_input_door)
#
# 		elif g_print_event & LCD_OUTPUT_DOOR:
# 			g_print_event &= (~LCD_OUTPUT_DOOR)
# 			displayOutputDoor(g_print_output_door)
#
# 		elif g_print_event & LCD_SAFE_DOOR:
# 			g_print_event &= (~LCD_SAFE_DOOR)
# 			displaySafeDoor(g_print_safe_door)
#
# 		elif g_print_event & LCD_TEMPERATURE:
# 			g_print_event &= (~LCD_TEMPERATURE)
# 			displayTemp(g_print_internal_temp, g_print_external_temp)
#
# 		elif g_print_event & LCD_STATE:
# 			g_print_event &= (~LCD_STATE)
# 			displayState(g_print_state)
#
# 		elif g_print_event & LCD_LOADCELL:
# 			g_print_event &= (~LCD_LOADCELL)
# 			displayLoadcell(g_print_loadcell, g_print_target_loadcell)
#
# 		elif g_print_event & LCD_LOADCELL_FACTOR:
# 			g_print_event &= (~LCD_LOADCELL_FACTOR)
# 			displayLoadcellFactor(g_print_loadcell_factor)
#
# 		elif g_print_event_2 & LCD_ELAPSED_TIME:
# 			g_print_event_2 &= (~LCD_ELAPSED_TIME)
# 			displayElapsed(g_print_elapsed_time)

		while_count += 1
		if (while_count > period):
			while_count = 0

			l_dec_val = ctl.DIN(0)

			g_res_door_btn = val_to_json(l_dec_val)

			dry_client.publish("/res_input_door", g_res_door_btn)

if __name__ == "__main__":
	print("Start exec.py...")
	core_func()
