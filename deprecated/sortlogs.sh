#!/bin/bash
sorted=()

sort_by_time() {
	local filename=$1

	# Check if the file is empty
	if [ ! -s "$filename" ]; then
		echo "File $filename is empty or does not exist."
		return
	fi

	# Read the first line of the file
	local line=$(head -n 1 "$filename")

	# Extract the numeric value preceded by "time":
	if [[ $line =~ \"time\":([0-9]+) ]]; then
		local time_value=${BASH_REMATCH[1]}
		
		# Append the value and filename to the array
		sorted+=("$time_value:$filename")

		# Sort the array by the numeric time values in ascending order
		IFS=$'\n' sorted=($(sort -n <<<"${sorted[*]}"))
	else
		echo "No time value found in the first line of $filename."
	fi
}

for filename in logs/*.log; do
	sort_by_time "$filename"
done

# for entry in "${sorted[@]}"; do
# 	log_file=${entry:14}
# 	log_filename=${log_file:5}
# 	echo $log_filename
	

# 	cp $log_file ./sorted/$log_filename
# done

for index in "${!sorted[@]}"; do
	entry=${sorted[$index]}
	echo $entry
	log_file=${entry:14}
	log_filename=${log_file:5}
	echo $log_filename
	
	cp ./$log_file ./sorted/$index.log
done