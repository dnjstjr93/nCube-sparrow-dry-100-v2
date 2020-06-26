# nCube-sparrow-dry-100

## 1. Set I2C
```
$ sudo nano /boot/config.txt

# Add i2c port & bus at last line
dtoverlay=i2c-gpio,i2c_gpio_sda=31,i2c_gpio_scl=30,bus=4 #SX1509 Port
dtoverlay=i2c-gpio,i2c_gpio_sda=38,i2c_gpio_scl=16,bus=3 #LCD Port
```

## 2. Install requirements

### MQTT-broker
```
$ wget http://repo.mosquitto.org/debian/mosquitto-repo.gpg.key
$ sudo apt-key add mosquitto-repo.gpg.key
$ cd /etc/apt/sources.list.d/
$ sudo wget http://repo.mosquitto.org/debian/mosquitto-buster.list 
$ sudo apt-get update
$ sudo apt-get install mosquitto
```
### Python Library
#### adafruit-blinka
```
$ pip3 install adafruit-blinka
```
#### mqtt
```
$ pip3 install paho-mqtt
```
#### LCD
```
$ pip3 install adafruit-circuitpython-charlcd
 ```
#### Temperature - MAX6675.py
```
$ git clone https://github.com/tdack/MAX6675.git
$ sudo apt-get update
$ sudo apt-get install build-essential python-dev python-smbus
$ sudo python3 MAX6675/setup.py install 
$ sudo cp MAX6675/MAX6675/MAX6675.py /home/pi/nCube-sparrow-dry/
```
#### Load Cell - hx711.py
```
$ git clone https://github.com/tatobari/hx711py
$ sudo cp hx711py/hx711.py /home/pi/nCube-sparrow-dry/
```
  
## 3. Install dependencies
```
$ curl -sL https://deb.nodesource.com/setup_10.x | sudo -E bash -

$ sudo apt-get install -y nodejs

$ node -v

$ sudo npm install -g pm2

$ git clone https://github.com/IoTKETI/nCube-sparrow-dry-100

$ cd /home/pi/nCube-sparrow-dry-100

$ npm install
```

## 4. Auto Start
```
$ sudo nano /etc/xdg/lxsession/LXDE-pi/autostart
```
```
# Add start command
sh /home/pi/nCube-sparrow-dry-100/auto-food.sh
```
