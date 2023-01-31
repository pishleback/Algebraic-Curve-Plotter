import sys
sys.set_int_max_str_digits(0)

import flask
import turbo_flask
app = flask.Flask(__name__)
turbo = turbo_flask.Turbo()
turbo.init_app(app)

import zmq
import json
import messages
from io import BytesIO
zmq_ctx = zmq.Context()

import secrets
app.secret_key = secrets.token_hex(32) #used to sign session data in cookies

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
    curve_str = flask.request.form.get("curve", "x^3 - 3x^2y - 3x^2 - 3xy^2 - 5xy - 3x + y^3 - 3y^2 - 3y + 1")
    warnings = []
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
        for v in curve_msg.vars():
            if not v in {"x", "y"}:
                raise messages.ParseError()

        if curve_msg.degree() > 20:
            warnings.append("Polynomials of high degree may not render correctly.")
        
        curve_mj = curve_msg.to_mathjax()
        curve_disp = R"\[" + curve_mj + R" = 0\]"

        socket = zmq_ctx.socket(zmq.REQ)
        socket.connect("tcp://sage:5555")
        socket.send(json.dumps({"polynomial" : curve_msg.to_json()}).encode("utf-8"))
        msg = json.loads(socket.recv().decode("utf-8"))

        if msg["status"] == "fatal_error":
            raise Exception("An error was raised by sage:\n\n" + msg["traceback"])
        elif msg["status"] == "error_message":
            raise messages.ParseError(msg["message"])
        assert msg["status"] == "good"


        factors = [(messages.Poly.from_json(factor["prime"]), factor["power"]) for factor in msg["factors"]]
        curve_glsls = [f[0].homogenize("z").to_glsl({"x" : "x", "y" : "y", "z" : "z"}) for f in factors]
        rational_pts = [[float(messages.Rational.from_json(pt[i]).to_frac()) for i in range(3)] for pt in msg["rational_points"]]

        curve_disp = ""
        curve_disp += R"\["
        if len(factors) == 0:
            curve_disp += "1"
        else:
            for factor, power in factors:
                if factor.num_terms() == 1 or (len(factors) == 1 and power == 1):
                    curve_disp += factor.to_mathjax()
                else:
                    curve_disp += R"\left(" + factor.to_mathjax() + R"\right)"
                if power > 1:
                    curve_disp += "^{" + str(power) + R"}"
        curve_disp += R"=0\]"
    
    except messages.ParseError:
        curve_disp = None
        curve_glsls = []
        rational_pts = []
    
    ans = flask.render_template('main.html',
                                curve_input = curve_str,
                                curve_disp = curve_disp,
                                warnings = warnings,
                                curve_glsls = curve_glsls,
                                rational_pts = rational_pts)
    return ans














