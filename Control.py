class Control:
        from SX1509 import SX1509


        def __init__(self, sx: SX1509):
                self.sx = sx
                self.init()

        def reset(self):
                self.sx.write(self.sx.RegReset, 0x12)
                self.sx.write(self.sx.RegReset, 0x34)

        def init(self):
                self.reset()
                self.sx.write(self.sx.RegDirA, 0b00011111)
                self.sx.write(self.sx.RegDirB, 0b00000000)
                '''
                # disable input
                self.sx.write(self.sx.RegInputDisableA, 0b11100000) 
                self.sx.write(self.sx.RegInputDisableB, 0b11111111) 
                # disable pull up
                self.sx.write(self.sx.RegPullUpA, 0b11100000)
                self.sx.write(self.sx.RegPullUpB, 0b11111111)
                # enable drain
                self.sx.write(self.sx.RegOpenDrainA, 0b00011111)
                self.sx.write(self.sx.RegOpenDrainB, 0b00000000)
                # register all pins to output
                self.sx.write(self.sx.RegDirA, 0b11100000)
                self.sx.write(self.sx.RegDirB, 0b11111111)
                # enable internal oscillator
                self.sx.write(self.sx.RegClock, 0b00000000)
                # define frequency
                self.sx.write(self.sx.RegMisc, 0b00000000)
                # enable led driver for all pins
                self.sx.write(self.sx.RegLEDDriverEnableA, 0b00000000)
                self.sx.write(self.sx.RegLEDDriverEnableB, 0b00000000)
                ## turn off all leds
                self.sx.write(self.sx.RegDataA, 0b11111111)
                self.sx.write(self.sx.RegDataB, 0b11111111)
                '''

        def __digitalOut(self, id: int, on: bool):
                reg = self.sx.RegDataA
                shift = id
                if(shift > 7):
                        shift = shift - 8
                        reg = self.sx.RegDataB
                if(on):
#                         print('reg:', self.sx.read(reg))
#                         print('shift:', bin(1 << shift))
#                         print('result: ', self.sx.read(reg) | 1 << shift)
                        self.sx.write(reg, self.sx.read(reg) | 1 << shift)
                        
                else:
#                         print('reg:', self.sx.read(reg))
#                         print('shift:', bin(1 << shift))
#                         print('result: ', self.sx.read(reg) & ~ (1 << shift))
                        self.sx.write(reg, self.sx.read(reg) & ~ (1 << shift))

        def __digitalIn(self, id: int):
                reg = self.sx.RegDataA
                shift = id
                if(shift > 7):
                        shift = shift - 8
                        reg = self.sx.RegDataB
                
                return self.sx.read(reg) 


        def DOUT(self, id: int, status: bool):
                self.__digitalOut(id, status)

        def DIN(self, id: int):
                dec_val = self.__digitalIn(id)
                return dec_val
