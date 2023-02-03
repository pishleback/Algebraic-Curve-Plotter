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
import messages
import sage_messages
from io import BytesIO
zmq_ctx = zmq.Context()

import secrets
app.secret_key = "95739513cd1b289695c843cc62d2bac4fa2cc3e038ddf186124a867e01adbea6" #secrets.token_hex(32) #used to sign session data in cookies

def make_identity_generator():
    n : int = 0
    while True:
        yield n
        n += 1
identity_generator = make_identity_generator()
del make_identity_generator

class SessionManager():
    def __init__(self):
        self._next_ident : int = 0
    
    def create_identity(self) -> int:
        new_identity = self._next_ident
        self._next_ident += 1
        return new_identity

SESSION_MANAGER = SessionManager()
del SessionManager

@turbo.user_id
def get_user_id():
    import random
    identity_key = "_identity"
    if not identity_key in flask.session:
        flask.session[identity_key] = SESSION_MANAGER.create_identity()
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
            socket.send(json.dumps({"command" : "default", "params" : {"polynomial" : poly.to_json()}}).encode("utf-8"))
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