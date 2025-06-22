settings = {
    filter: [
        {'lowpass': 20}, {'highpass':40}
    ]
}


[
    [0,2,3,4,5],
    [0,2,3,4,5],
    [0,2,3,4,5],
    [0,2,3,4,5],
    [0,2,3,4,5],
    [0,2,3,4,5],
    [0,2,3,4,5],
    [0,2,3,4,5],
    [0,2,3,4,5],
    [0,2,3,4,5],
]


CLIENT REQUESTS:
- get_data
    - send settings object WITH the request 

FORMAT for get_data

const message = {
    command: 'get_data',
    filter: [
        {'lowpass': 20}, {'highpass':40}
    ]
}

message.jsonify()
ws.send(message)