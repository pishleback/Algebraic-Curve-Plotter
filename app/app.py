import sys
sys.set_int_max_str_digits(0)

import flask
import turbo_flask
app = flask.Flask(__name__)
turbo = turbo_flask.Turbo()
turbo.init_app(app)

import redis
cache = redis.Redis(host='redis', port=6379)

import zmq
import json
import messages
from io import BytesIO
context = zmq.Context()


def get_hit_count():
    retries = 5
    while True:
        try:
            return cache.incr('hits')
        except redis.exceptions.ConnectionError as exc:
            if retries == 0:
                raise exc
            retries -= 1
            time.sleep(0.1)

@app.route('/index', methods = ["GET", "POST"])
def hello():
    curve_str = flask.request.form.get("curve", "x^3 - 3x^2y - 3x^2 - 3xy^2 - 5xy - 3x + y^3 - 3y^2 - 3y + 1")
    try:
        def preprocess(curve_str):
            def preprocess_single(curve_str):
                if "=" in curve_str:
                    if curve_str.count("=") > 1:
                        raise messages.ParseError()
                    lhs, rhs = curve_str.split("=")
                    return "(" + lhs + ") - (" + rhs + ")"
                return curve_str
                
            curve_str = curve_str.replace(" ", "")
            return "".join("(" + preprocess_single(cs) + ")" for cs in curve_str.split(","))
            
        curve_msg = messages.Poly.from_string(preprocess(curve_str))
        
        curve_mj = curve_msg.to_mathjax()
        curve_disp = r"\[" + curve_mj + r" = 0\]"

        socket = context.socket(zmq.REQ)
        socket.connect("tcp://sage:5555")
        socket.send(json.dumps({"polynomial" : curve_msg.to_json()}).encode("utf-8"))
        msg = json.loads(socket.recv().decode("utf-8"))

        if msg["status"] == "error":
            raise Exception("An error was raised by sage:\n\n" + msg["traceback"])
        assert msg["status"] == "good"

        factors = [(messages.Poly.from_json(factor["prime"]), factor["power"]) for factor in msg["factors"]]
        curve_glsls = [f[0].homogenize("z").to_glsl({"x" : "x", "y" : "y", "z" : "z"}) for f in factors]

        print(factors)
        
        curve_disp = ""
        curve_disp += r"\["
        for factor, power in factors:
            if factor.num_terms() == 1 or (len(factors) == 1 and power == 1):
                curve_disp += factor.to_mathjax()
            else:
                curve_disp += r"\left(" + factor.to_mathjax() + r"\right)"
            if power > 1:
                curve_disp += "^{" + str(power) + r"}"
        curve_disp += r"=0\]"
    
    except messages.ParseError:
        curve_disp = None
        curve_glsls = []
    
    ans = flask.render_template('hello.html',
                                count = get_hit_count(),
                                curve_input = curve_str,
                                curve_disp = curve_disp,
                                curve_glsls = curve_glsls)
    return ans







@app.route('/edit')
def edit():
    return flask.render_template("edit.html")
        
















    

