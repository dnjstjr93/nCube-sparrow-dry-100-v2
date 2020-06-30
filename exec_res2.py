import sys, os, json, queue
import paho.mqtt.client as mqtt
import SX1509
import Control

g_res_event = 0x00

RES_INPUT_DOOR = 0x01

g_res_door_btn = {}


g_set_event = 0x00

SET_FAN = 0x01
SET_HEATER = 0x02
SET_STIRRER = 0x04
SET_LIFT = 0x08
SET_CRUSHER = 0x10
SET_CLEANING_PUMP = 0x20

g_set_fan_val = {}
g_set_heat_val = {}
g_set_stirrer_val = {}
g_set_lift_val = {}
g_set_crusher_val = {}
g_set_cleaning_pump_val = {}

q = queue.Queue()
global arr_count
arr_count = 5
global bottom_temp_arr, top_temp_arr
bottom_temp_arr = [0,0,0,0,0]
top_temp_arr = [0,0,0,0,0]


#---SET Pin-------------------------------------------------------------
# Load Cell (Direct)

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

#---Heater--------------------------------------------------------------
def heater(val):
	print('heater value: ', val)
	ctl.DOUT(TPR_pin,1)
	ctl.DOUT(TPR_pin,0)
	ctl.DOUT(Heater_pin,val)

#---Stirrer-------------------------------------------------------------
def stirrer(val):
	ctl.DOUT(Stirrer_pin,val)

#---Lift----------------------------------------------------------------
def lift(val):
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
	ctl.DOUT(Crusher_pin,val)

#---Cooling_Fan---------------------------------------------------------
def cooling_fan(val):
	ctl.DOUT(Cooling_Fan_pin,val)
	ctl.DOUT(Circulator_pin,val)
	ctl.DOUT(Pump_pin,val)
	
#---Cleaning_Pump-------------------------------------------------------
def cleaning_pump(val):
	ctl.DOUT(Cleaning_Pump_pin,val)

# #---Thyristor Power Regulator-------------------------------------------
# def tpr(val):
# 	ctl.DOUT(TPR_pin,val)

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
	
#---MQTT----------------------------------------------------------------
def on_connect(client,userdata,flags, rc):
	print('[dry_mqtt_connect] connect to ', broker_address)
	dry_client.subscribe("/set_solenoid")
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


def func_set_q(f_msg):
	q.put_nowait(f_msg)


def on_message(client, userdata, _msg):
	global g_res_event
	global g_res_door_btn

	global g_set_event
	global g_set_fan_val
	global g_set_heat_val
	global g_set_stirrer_val
	global g_set_lift_val
	global g_set_crusher_val
	global g_set_cleaning_pump_val

	if _msg.topic == '/set_fan':
		data = _msg.payload.decode('utf-8').replace("'", '"')
		g_set_fan_val = json_to_val(data)
		g_set_event |= SET_FAN

	elif _msg.topic == '/set_heater':
		data = _msg.payload.decode('utf-8').replace("'", '"')
		g_set_heat_val = json_to_val(data)
		g_set_event |= SET_HEATER

	elif _msg.topic == '/set_heater':
		data = _msg.payload.decode('utf-8').replace("'", '"')
		g_set_stirrer_val = json_to_val(data)
		g_set_event |= SET_STIRRER

	elif _msg.topic == '/set_heater':
		data = _msg.payload.decode('utf-8').replace("'", '"')
		g_set_lift_val = json_to_val(data)
		g_set_event |= SET_LIFT

	elif _msg.topic == '/set_heater':
		data = _msg.payload.decode('utf-8').replace("'", '"')
		g_set_crusher_val = json_to_val(data)
		g_set_event |= SET_CRUSHER

	elif _msg.topic == '/set_heater':
		data = _msg.payload.decode('utf-8').replace("'", '"')
		g_set_cleaning_pump_val = json_to_val(data)
		g_set_event |= SET_CLEANING_PUMP

	elif _msg.topic == '/req_input_door':
		l_dec_val = ctl.DIN(0)

		g_res_door_btn = val_to_json(l_dec_val)
		g_res_event |= RES_INPUT_DOOR

	func_set_q(_msg)
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

def mqtt_dequeue():
	if not q.empty():
		try:
			recv_msg = q.get(False)
			g_recv_topic = recv_msg.topic
			# if (g_recv_topic == '/set_solenoid'):
				#print("topic: ", g_recv_topic)
				# data = recv_msg.payload.decode('utf-8').replace("'", '"')
# 				print('set_solenoid: ', data)
				# solenoid_val = json_to_val(data)

			# elif (g_recv_topic == '/set_fan'):
				#print("topic: ", g_recv_topic)
				# data = recv_msg.payload.decode('utf-8').replace("'", '"')
# 				print('set_fan: ', data)
				# fan_val = json_to_val(data)
				# cooling_fan(fan_val)

			# elif (g_recv_topic == '/set_heater'):
				#print("topic: ", g_recv_topic)
				# data = recv_msg.payload.decode('utf-8').replace("'", '"')
# 				print('set_heater: ', data)
				# heat_val = json_to_val(data)
# 				print('heat_val: ', heat_val)
				# heater(heat_val)

			# elif (g_recv_topic == '/set_stirrer'):
				#print("topic: ", g_recv_topic)
				# data = recv_msg.payload.decode('utf-8').replace("'", '"')
# 				print('set_stirrer: ', data)
				#stirrer_val = json_to_val(data)
				# stirrer(stirrer_val)

			# elif (g_recv_topic == '/set_lift'):
				#print("topic: ", g_recv_topic)
				# data = recv_msg.payload.decode('utf-8').replace("'", '"')
				# print('set_lift: ', data)
				# lift_val = json_to_val(data)
				# lift(lift_val)

			# elif (g_recv_topic == '/set_crusher'):
				#print("topic: ", g_recv_topic)
				# data = recv_msg.payload.decode('utf-8').replace("'", '"')
# 				print('set_crusher: ', data)
				# crusher_val = json_to_val(data)
				# crusher(crusher_val)

			# elif (g_recv_topic == '/set_cleaning_pump'):
				#print("topic: ", g_recv_topic)
				# data = recv_msg.payload.decode('utf-8').replace("'", '"')
# 				print('set_cleaning_pump: ', data)
				# cleaning_pump_val = json_to_val(data)
				# cleaning_pump(cleaning_pump_val)
			
		except queue.Empty:
			pass
		q.task_done()

def core_func():
	# period = 20000
	# while_count = 0
	global g_res_event
	global g_res_door_btn

	global g_set_event
	global g_set_fan_val
	global g_set_heat_val
	global g_set_stirrer_val
	global g_set_lift_val
	global g_set_crusher_val
	global g_set_cleaning_pump_val

	while True:
		if g_set_event & SET_FAN:
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

		elif g_res_event & RES_INPUT_DOOR:
			g_res_event &= (~RES_INPUT_DOOR)
			dry_client.publish("/res_input_door", g_res_door_btn)

		# while_count += 1
		# if (while_count > period):
			# while_count = 0

			# l_dec_val = ctl.DIN(0)

			# g_res_door_btn = val_to_json(l_dec_val)
			
			# dry_client.publish("/res_input_door", json_input_door)
			
		mqtt_dequeue()

if __name__ == "__main__":
	print("Start exec_res2.py...")
	core_func()
