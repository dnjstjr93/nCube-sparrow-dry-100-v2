import sys, os, time, json
import datetime
import board, busio
import paho.mqtt.client as mqtt
import adafruit_character_lcd.character_lcd_i2c as character_lcd

g_print_event = 0x00

LCD_DEBUG = 0x01
LCD_INPUT_DOOR = 0x02
LCD_OUTPUT_DOOR = 0x04
LCD_SAFE_DOOR = 0x08
LCD_TEMPERATURE = 0X10
LCD_STATE = 0x20
LCD_LOADCELL = 0x40
LCD_LOADCELL_FACTOR = 0x80

g_print_event_2 = 0x00

LCD_ELAPSED_TIME = 0x01

g_print_debug = ''
g_print_input_door = 0
g_print_output_door = 0
g_print_safe_door = 0
g_print_internal_temp = 0
g_print_external_temp = 0
g_print_state = ''
g_print_loadcell = ''
g_print_target_loadcell = ''
g_print_loadcell_factor = 0
g_print_corr_val = 0
g_print_elapsed_time = ''

#---SET Pin-------------------------------------------------------------
# LCD I2C 
SDA = 38 # SDA_LCD-DAT 
SCL = 16 # SCL_LCD-CLK 

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


def on_disconnect(client, userdata, flags, rc=0):
	print(str(rc))


def on_subscribe(client, userdata, mid, granted_qos):
	print("subscribed: " + str(mid) + " " + str(granted_qos))


def on_message(client, userdata, _msg):
	global g_print_event
	global g_print_event_2
	global g_print_debug
	global g_print_input_door
	global g_print_output_door
	global g_print_safe_door
	global g_print_internal_temp
	global g_print_external_temp
	global g_print_state
	global g_print_loadcell
	global g_print_target_loadcell
	global g_print_loadcell_factor
	global g_print_corr_val
	global g_print_elapsed_time

	if _msg.topic == '/print_lcd_debug_message':
		data = _msg.payload.decode('utf-8').replace("'", '"')
		g_print_debug = json_to_val(data)
		g_print_event |= LCD_DEBUG
		
	elif _msg.topic == '/print_lcd_input_door':
		data = _msg.payload.decode('utf-8').replace("'", '"')
		g_print_input_door = json_to_val(data)
		g_print_event |= LCD_INPUT_DOOR
	
	elif _msg.topic == '/print_lcd_output_door':
		data = _msg.payload.decode('utf-8').replace("'", '"')
		g_print_output_door = json_to_val(data)
		g_print_event |= LCD_OUTPUT_DOOR
		
	elif _msg.topic == '/print_lcd_safe_door':
		data = _msg.payload.decode('utf-8').replace("'", '"')
		g_print_safe_door = json_to_val(data)
		g_print_event |= LCD_SAFE_DOOR

	elif _msg.topic == '/print_lcd_internal_temp':
		data = _msg.payload.decode('utf-8').replace("'", '"')
		g_print_internal_temp, g_print_external_temp = json_to_val(data)
		g_print_event |= LCD_TEMPERATURE

	elif _msg.topic == '/print_lcd_state':
		data = _msg.payload.decode('utf-8').replace("'", '"')
		g_print_state = json_to_val(data)
		g_print_event |= LCD_STATE

	elif _msg.topic == '/print_lcd_loadcell':
		data = _msg.payload.decode('utf-8').replace("'", '"')
		loadcell, target_loadcell = json_to_val(data)
		g_print_loadcell = str(loadcell)
		g_print_target_loadcell = str(target_loadcell)
		g_print_event |= LCD_LOADCELL

	elif _msg.topic == '/print_lcd_loadcell_factor':
		data = _msg.payload.decode('utf-8').replace("'", '"')
		g_print_loadcell_factor, g_print_corr_val = json_to_val(data)
		g_print_event |= LCD_LOADCELL_FACTOR

	elif _msg.topic == '/print_lcd_elapsed_time':
		data = _msg.payload.decode('utf-8').replace("'", '"')
		elapsed_time = json_to_val(data)
		g_print_elapsed_time = str(datetime.timedelta(seconds=elapsed_time))
		g_print_event_2 |= LCD_ELAPSED_TIME

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
	# print("State: ", msg1)
#	if (len(str(msg1)) > 5):
#		msg1 = str(msg1)
#		msg1 = msg1[0:5]
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
	print(msg1)
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


#=======================================================================
global dry_client
broker_address = "localhost"
port = 1883

global g_lcd
g_lcd = lcd_init()

dry_client = mqtt.Client()
dry_client.on_connect = on_connect
dry_client.on_disconnect = on_disconnect
dry_client.on_subscribe = on_subscribe
dry_client.on_message = on_message
dry_client.connect(broker_address, port)

dry_client.subscribe("/print_lcd_internal_temp")
dry_client.subscribe("/print_lcd_state")
dry_client.subscribe("/print_lcd_debug_message")
dry_client.subscribe("/print_lcd_loadcell")
dry_client.subscribe("/print_lcd_loadcell_factor")
dry_client.subscribe("/print_lcd_elapsed_time")
dry_client.subscribe("/print_lcd_input_door")
dry_client.subscribe("/print_lcd_output_door")
dry_client.subscribe("/print_lcd_safe_door")

dry_client.loop_start()

def core_func():
	global g_print_event
	global g_print_event_2
	global g_print_debug
	global g_print_input_door
	global g_print_output_door
	global g_print_safe_door
	global g_print_internal_temp
	global g_print_external_temp
	global g_print_state
	global g_print_loadcell
	global g_print_target_loadcell
	global g_print_loadcell_factor
	global g_print_corr_val
	global g_print_elapsed_time

	while True:
		if g_print_event & LCD_DEBUG:
			g_print_event &= (~LCD_DEBUG)
			displayMsg(g_print_debug)
			
		elif g_print_event & LCD_INPUT_DOOR:
			g_print_event &= (~LCD_INPUT_DOOR)
			displayInputDoor(g_print_input_door)
			
		elif g_print_event & LCD_OUTPUT_DOOR:
			g_print_event &= (~LCD_OUTPUT_DOOR)
			displayOutputDoor(g_print_output_door)
			
		elif g_print_event & LCD_SAFE_DOOR:
			g_print_event &= (~LCD_SAFE_DOOR)
			displaySafeDoor(g_print_safe_door)
			
		elif g_print_event & LCD_TEMPERATURE:
			g_print_event &= (~LCD_TEMPERATURE)
			displayTemp(g_print_internal_temp, g_print_external_temp)
			
		elif g_print_event & LCD_STATE:
			g_print_event &= (~LCD_STATE)
			displayState(g_print_state)
			
		elif g_print_event & LCD_LOADCELL:
			g_print_event &= (~LCD_LOADCELL)
			displayLoadcell(g_print_loadcell, g_print_target_loadcell)
			
		elif g_print_event & LCD_LOADCELL_FACTOR:
			g_print_event &= (~LCD_LOADCELL_FACTOR)
			displayLoadcellFactor(g_print_loadcell_factor)
			
		elif g_print_event_2 & LCD_ELAPSED_TIME:
			g_print_event_2 &= (~LCD_ELAPSED_TIME)
			displayElapsed(g_print_elapsed_time)


if __name__ == "__main__":
	print("Start exec_print.py...")
	core_func()
