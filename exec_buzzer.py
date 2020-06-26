import json, queue, time
import paho.mqtt.client as mqtt
import RPi.GPIO as GPIO


q = queue.Queue()

#---SET Pin-------------------------------------------------------------
Buzzer_pin = 11 # Direct Connect

GPIO.setmode(GPIO.BCM)
GPIO.setup(Buzzer_pin, GPIO.OUT)
#-----------------------------------------------------------------------

#---Buzzer--------------------------------------------------------------
def buzzer(val):
	freq = [1936, 2094, 1760]#[988, 1047, 880]
    
	try:
		# print(Buzzer_pin)
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


def func_set_q(f_msg):
	q.put_nowait(f_msg)


def on_message(client, userdata, _msg):
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

dry_client.subscribe("/set_buzzer")

dry_client.loop_start()


def mqtt_dequeue():
	if not q.empty():
		try:
			recv_msg = q.get(False)
			g_recv_topic = recv_msg.topic
			# print(g_recv_topic)

			if (g_recv_topic == '/set_buzzer'):
				#print("topic: ", g_recv_topic)
				buzzer_running = 1
				data = recv_msg.payload.decode('utf-8').replace("'", '"')
				buzzer_val = json_to_val(data)
				buzzer(buzzer_val)
				buzzer_running = 0

		except queue.Empty:
			pass
		q.task_done()

def core_func():
	period = 10000
	while_count = 0
	while True:
		while_count = while_count + 1
		mqtt_dequeue()

if __name__ == "__main__":
	print("Start exec_buzzer.py...")
	core_func()
