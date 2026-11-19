# Host side test for the portable firmware logic (no Arduino toolchain needed).
CXX      ?= c++
CXXFLAGS ?= -std=c++11 -Wall -Wextra -Werror -O1
ROOT     := ..
INCLUDE  := -I$(ROOT)/rec_controller

SRC := $(ROOT)/rec_controller/protocol.cpp \
       $(ROOT)/rec_controller/buttons.cpp \
       test_portable.cpp

TARGET := test_portable

.PHONY: all test clean
all: $(TARGET)

$(TARGET): $(SRC) $(ROOT)/rec_controller/protocol.h $(ROOT)/rec_controller/buttons.h
	$(CXX) $(CXXFLAGS) $(INCLUDE) -o $@ $(SRC)

test: $(TARGET)
	./$(TARGET)

clean:
	rm -f $(TARGET)
