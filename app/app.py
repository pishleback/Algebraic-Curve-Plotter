import sys
sys.set_int_max_str_digits(0)
import typing

import flask
import turbo_flask
app = flask.Flask(__name__)
turbo = turbo_flask.Turbo()
turbo.init_app(app)

import zmq
import json
import threading
import time
import messages
import sage_messages
from io import BytesIO
zmq_ctx = zmq.Context()

import redis
database = redis.Redis(host="redis", port=6379)

import secrets
if not "session_secret_key" in database:
    database["session_secret_key"] = secrets.token_hex(32)
    database["session_next_ident"] = 0
app.secret_key = database["session_secret_key"]
assert "session_next_ident" in database



@turbo.user_id
def get_user_id():
    import random
    identity_key = "_identity"
    if not identity_key in flask.session:
        ident = int(database["session_next_ident"])
        database["session_next_ident"] = ident + 1
        flask.session[identity_key] = ident
    return flask.session[identity_key]



@app.route('/index', methods = ["GET", "POST"])
def hello():

    def parse_curve_input(curve_str) -> typing.List[sage_messages.Poly]:
        curve_str = curve_str.replace(" ", "")

        def preprocess(curve_str) -> str:
            #replace f(x, y) = g(x, y) with f(x, y) - g(x, y)
            if "=" in curve_str:
                if curve_str.count("=") > 1:
                    raise messages.ParseError()
                lhs, rhs = curve_str.split("=")
                return "(" + lhs + ") - (" + rhs + ")"
            return curve_str
            
        polys = [sage_messages.Poly.from_string(preprocess(curve_str_split)) for curve_str_split in curve_str.split(",")]
        for poly in polys:
            for v in poly.vars():
                if not v in {"x", "y"}:
                    raise messages.ParseError()
        return polys

    if not "curve_input" in flask.session:
        flask.session["curve_input"] = "x^3 - 3x^2y - 3x^2 - 3xy^2 - 5xy - 3x + y^3 - 3y^2 - 3y + 1"
    flask.session["curve_input"] = flask.request.form.get("curve", flask.session["curve_input"])

    curve_str = flask.session["curve_input"]
    warnings = []
    try:
        polys = parse_curve_input(curve_str)
        
        for poly in polys:
            if poly.degree() > 20:
                warnings.append("Polynomials of high degree may not render correctly.")

        import distinctipy

        #hard coded initial colour pallete
        colours = [[1, 0, 0]]
        #extend as necessary using distinctipy
        if len(colours) < len(polys):
            colours.extend(distinctipy.get_colors(len(polys) - len(colours), colours + [[33/255, 150/255, 243/255], [0, 0, 0], [1, 1, 1]]))

        curve_disp = R"\[" + R" \quad ".join(poly.to_mathjax() + "=0" for poly in polys) + R"\]"

        curve_info = []
        rational_pt_info = []
        for idx, poly in enumerate(polys):
            socket = zmq_ctx.socket(zmq.REQ)
            socket.connect("tcp://sage:5555")
            socket.send(json.dumps({"command" : "default", "params" : {"polynomial" : poly.to_json(), "user_id" : get_user_id()}}).encode("utf-8"))
            msg = json.loads(socket.recv().decode("utf-8"))

            if msg["status"] == "fatal_error":
                raise Exception("An error was raised by sage:\n\n" + msg["traceback"])
            elif msg["status"] == "error_message":
                raise messages.ParseError(msg["message"])
            assert msg["status"] == "good"

            factors = [(sage_messages.Poly.from_json(factor["prime"]), factor["power"]) for factor in msg["factors"]]
            for f in factors:
                curve_info.append({"glsl" : f[0].homogenize("z").to_glsl({"x" : "x", "y" : "y", "z" : "z"}), "colour" : colours[idx]})

            for pt in msg["rational_points"]:
                rational_pt_info.append({"pt" : [float(sage_messages.Rational.from_json(pt[i]).to_frac()) for i in range(3)], "colour" : colours[idx]})
    
    except messages.ParseError:
        curve_disp = None
        curve_info = []
        rational_pt_info = []
    
    ans = flask.render_template('main.html',
                                curve_input = curve_str,
                                curve_disp = curve_disp,
                                warnings = warnings,
                                curve_info = curve_info,
                                rational_pt_info = rational_pt_info)

    print("get_user_id", get_user_id())

    return ans




@app.before_first_request
def before_first_request():
    def progress_update():
        import random
        
        with app.app_context():
            socket = zmq_ctx.socket(zmq.REP)
            socket.bind("tcp://0.0.0.0:5556")

            to_sends = {}

            while True:
                msg = json.loads(socket.recv().decode("utf-8"))
                socket.send(b"")

                if not msg["user_id"] in to_sends:
                    to_sends[msg["user_id"]] = {"t" : time.time(), "msgs" : []}
                to_sends[msg["user_id"]]["msgs"].append(msg)

                for user_id, info in list(to_sends.items()):
                    t = info["t"]
                    msgs = info["msgs"]
                    new_msgs = []
                    if time.time() - t < 5:
                        #client is not to be deemed dead yet

                        for msg in msgs:
                            try:
                                if msg["command"] == "clear":
                                    turbo.push(turbo.replace(flask.render_template('clear_rational_points.html'), "rational_points_tf"), to=msg["user_id"])
                                elif msg["command"] == "add":
                                    turbo.push(turbo.replace(flask.render_template('rational_points.html', rational_pt_info=[msg["rational_point"]]), "rational_points_tf"), to=msg["user_id"])
                                else:
                                    assert False
                            except KeyError:
                                #not currently connected to client
                                new_msgs.append(msg)

                        info["new_msgs"] = new_msgs
                        
                        if len(new_msgs) == 0:
                            del to_sends[user_id]
                        else:
                            info["new_msgs"] = new_msgs
                                
                    else:
                        print("dead client, idk what to do nowwwwwwww")

    threading.Thread(target=progress_update).start()