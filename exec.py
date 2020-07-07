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
import threading
from multiprocessing import Process

import exec_buzzer
import exec_print

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
	print('set_factor: ', referenceUnit)
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

dry_client.loop_start()

loadcell_factor, loadcell_corr_val = save_factor()
init_loadcell(loadcell_factor)

# global g_lcd
# g_lcd = lcd_init()

def core_func():
	period = 1000
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


		while_count += 1
		if (while_count > period):
			while_count = 0

			l_dec_val = ctl.DIN(0)

			g_res_door_btn = val_to_json(l_dec_val)

			dry_client.publish("/res_input_door", g_res_door_btn)

if __name__ == "__main__":
	t_buzzer = threading.Thread(target = exec_buzzer.core_func)
	# t_print = threading.Thread(target = exec_print.core_func)
	t_buzzer.start()
	# t_print.start()
	print("Start exec.py...")
	core_func()
	
