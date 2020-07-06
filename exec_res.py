import sys, os, json
import paho.mqtt.client as mqtt
import MAX6675
from hx711 import HX711

g_res_event = 0x00

RES_TEMPERATURE = 0x01
RES_WEIGHT = 0x02
RES_ZERO_POINT = 0x04
RES_CALC_FACTOR = 0x08
SET_ZERO_POINT = 0x10

g_res_internal_temp = {}
g_res_weight = {}
g_res_zero_point = {}
g_res_calc_factor = {}
g_set_zero_point = 0.0

# global arr_count
arr_count = 5
# global bottom_temp_arr, top_temp_arr
bottom_temp_arr = [0,0,0,0,0]
top_temp_arr = [0,0,0,0,0]

avg_bottom_temp = 0.0
avg_top_temp = 0.0
nWeightCount = 1
weight_arr = [0, 0, 0, 0, 0]
flag = 0
get_correlation_value = 0.0

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

# Temperature 1 Top
CLK1 = 17 #
CS1  = 26 #
SO1  = 27 #
# Temperature 2 Bottom
CLK2 = 39 #
CS2  = 40 #
SO2  = 41 #

#---SET Pin------------------------------------------------------------
# Temperature
sensor1 = MAX6675.MAX6675(CLK1, CS1, SO1)
sensor2 = MAX6675.MAX6675(CLK2, CS2, SO2)

#---GET Temperature-----------------------------------------------------
def get_temp():
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

	temperature1 = val_to_json(avg_top_temp, avg_bottom_temp)

	return (temperature1)

#---SET Load Cell & GET Weight------------------------------------------
def cleanAndExit():
    print("Cleaning...")

    if not EMULATE_HX711:
        GPIO.cleanup()

    print("Bye!")
    sys.exit()


def init_loadcell(referenceUnit = 1):
	global hx
	global nWeightCount
	# nWeightCount = 1

	hx = HX711(HX711_DAT, HX711_CLK)
	hx.set_reading_format("MSB", "MSB")
	hx.set_reference_unit(referenceUnit)
	hx.reset()


def set_factor(referenceUnit):
	print('set_factor: ', referenceUnit)
	hx.set_reference_unit(referenceUnit)
	hx.reset()


def get_loadcell():
	global flag
	global weight_arr
	global arr_count
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
		print("===Correlation_Value: ", get_correlation_value)
		final_weight = avg_weight - get_correlation_value
		final_weight = max(0, float(final_weight))
		print('weight_arr: ', weight_arr)
		print('get_loadcell - correlation_value: ', get_correlation_value)
		print('get_loadcell - avg_weight: ', avg_weight)
		print('get_loadcell - final_weight: ', final_weight)
		weight_json = val_to_json(final_weight)

	except (KeyboardInterrupt, SystemExit):
		cleanAndExit()

	return (weight_json)


def ref_weight(tare_weight):
	global avg_zero_weight

	val = val_to_json(1)

	init_loadcell(1)

	zero_weight = 0
	for i in range(nWeightCount):
		weight = hx.get_weight(5)
		zero_weight += weight

	avg_zero_weight = (zero_weight / nWeightCount)
	print("ref_weight - avg_zero_weight: ", avg_zero_weight)

	print("Add weight for initialize...")

	return val


def calc_ref_Unit(reference_weight, cal_set_ref_Unit):
	global get_correlation_value
	
	print('calc_ref_Unit: ', reference_weight, ' ', cal_set_ref_Unit)

	ref_weight_total = 0

	for i in range(nWeightCount):
		weight = hx.get_weight(5)
		ref_weight_total += weight

	print('calc_ref_Unit - avg_zero_weight: ', avg_zero_weight)

	avg_ref_weight = (ref_weight_total / nWeightCount)
	cur_weight = (avg_ref_weight - avg_zero_weight)
	cur_factor = (cur_weight / reference_weight)
	print('calc_ref_Unit - cur_weight: ', cur_weight)
	print('calc_ref_Unit - cur_factor: ', cur_factor)

	if (abs(cur_factor) < 1.0):
		cur_factor = cal_set_ref_Unit

	hx.set_reference_unit(cur_factor)
	hx.reset()

	factor_weight_total = 0

	for i in range(nWeightCount):
		weight = hx.get_weight(5)
		factor_weight_total += weight

	avg_factor_weight = (factor_weight_total / nWeightCount)
	# avg_factor_weight = max(0, float(avg_factor_weight))
	correlation_value = avg_factor_weight - reference_weight
	factor = {"factor":cur_factor, "correlation_value":correlation_value}
	get_correlation_value = correlation_value
	print('calc_ref_Unit - avg_factor_weight: ', avg_factor_weight)
	print('calc_ref_Unit - correlation_value: ', correlation_value)
	with open ("./factor.json", "w") as factor_json:
		json.dump(factor, factor_json)

	print("Complete!")

	calc_ref_unit = val_to_json(cur_factor, correlation_value)

	return calc_ref_unit
#-----------------------------------------------------------------------


#---MQTT----------------------------------------------------------------
def on_connect(client,userdata,flags, rc):
	print('[dry_mqtt_connect] connect to ', broker_address)
	dry_client.subscribe("/req_internal_temp")
	dry_client.subscribe("/req_weight")
	dry_client.subscribe("/req_zero_point")
	dry_client.subscribe("/req_calc_factor")
	dry_client.subscribe("/set_zero_point")


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
    global referenceUnit
    global correlation_value
    global loadcell_corr_val
    global get_correlation_value
    referenceUnit = 1
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
        referenceUnit, set_corr_val = json_to_val(data)
        g_set_zero_point = float(referenceUnit)
        get_correlation_value = float(set_corr_val)
        g_res_event |= SET_ZERO_POINT

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

global loadcell_factor
global loadcell_corr_val

loadcell_param = {"factor":6555,"correlation_value":200}

if (os. path.isfile("./factor.json") == False):
	with open("./factor.json","w") as refUnit_json:
		json.dump(loadcell_param, refUnit_json)
	loadcell_factor = loadcell_param['factor']
	loadcell_corr_val = loadcell_param['correlation_value']
else:
	refUnit_json = open("./factor.json").read()
	data = json.loads(refUnit_json)

	loadcell_factor = data['factor']
	loadcell_corr_val = data['correlation_value']

init_loadcell(loadcell_factor)

# weight_arr = [0, 0, 0, 0, 0]
# flag = 0

def core_func():
	period = 1
	while_count = 0
	# global req_zero_ref_weight
	# global referenceUnit
	# global correlation_value
	# referenceUnit = 1
	# correlation_value = 200

	global g_res_event
	global g_res_internal_temp
	global g_res_weight
	global g_res_zero_point
	global g_res_calc_factor
	global g_set_zero_point

	global req_zero_ref_weight
	global referenceUnit
	global correlation_value
	global loadcell_corr_val
	global get_correlation_value
	
	referenceUnit = 1
	#correlation_value = loadcell_corr_val

	while True:
		if g_res_event & RES_TEMPERATURE:
			g_res_event &= (~RES_TEMPERATURE)
			g_res_internal_temp = get_temp()
			dry_client.publish("/res_internal_temp", g_res_internal_temp)

		elif g_res_event & RES_ZERO_POINT:
			g_res_event &= (~RES_ZERO_POINT)
			#data = _msg.payload.decode('utf-8').replace("'", '"')
			#req_zero_reference_weight = json.loads(data)
			#req_zero_ref_weight = req_zero_reference_weight['val']
			g_res_zero_point = ref_weight(req_zero_ref_weight)
			dry_client.publish("/res_zero_point", g_res_zero_point)

		elif g_res_event & RES_CALC_FACTOR:
			g_res_event &= (~RES_CALC_FACTOR)
			g_res_calc_factor = calc_ref_Unit(req_zero_ref_weight, referenceUnit)
			dry_client.publish("/res_calc_factor", g_res_calc_factor)

		elif g_res_event & RES_WEIGHT:
			g_res_event &= (~RES_WEIGHT)
			g_res_weight = get_loadcell()
			dry_client.publish("/res_weight", g_res_weight)

		elif g_res_event & SET_ZERO_POINT:
			g_res_event &= (~SET_ZERO_POINT)
			#referenceUnit, set_corr_val = json_to_val(data)
			#g_set_zero_point = float(referenceUnit)
			#get_correlation_value = float(set_corr_val)
			set_factor(g_set_zero_point)
			

if __name__ == "__main__":
	print("Start exec_res.py...")
	core_func()
