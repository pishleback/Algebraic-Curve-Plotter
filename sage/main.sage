import json
import zmq
import messages
import fractions
import traceback
import math

context = zmq.Context()
socket = context.socket(zmq.REP)
socket.bind("tcp://0.0.0.0:5555")


#R.<x,y,z> = QQ[]
#poly = x^3 - 3*x^2*y - 3*x^2*z - 3*x*y^2 - 5*x*y*z - 3*x*z^2 + y^3 - 3*y^2*z - 3*y*z^2 + z^3
#f = EllipticCurve_from_cubic(poly, [-1,0,1], morphism=True);
#E = f.domain() #emoji problem curve
#W = f.codomain() #emoji problem curve in weirstrass form
#P = W.gens()[0] #P is a generator of the free part of the group


#print(f([-1, 0, 1]))
#print(0 * P)


while True:
	try:
		request_msg = json.loads(socket.recv().decode("utf-8"))
		poly_msg = messages.Poly.from_json(request_msg["polynomial"])
		var_strs = list(poly_msg.vars())
		R = QQ[", ".join(var_strs)]
				
		var_sage = R.gens()	
		def convert_frac(frac):
			return Integer(frac.numerator) / Integer(frac.denominator)
		poly_sage = poly_msg.eval({v_str : v_sage for v_str, v_sage in zip(var_strs, var_sage)}, convert_frac = convert_frac)
		
		def sage_poly_to_msg_poly(poly_sage):
			#poly_dict contains {(v1_pow : int, v2_pow : int, ..., vn_pow : int) : coeff}
			poly_dict = poly_sage.dict()
			#handle univariate and multivariate seperately, becasue.dict returns different things
			if len(var_sage) == 1:
				poly_dict = {(power,) : coeff for power, coeff in poly_dict.items()}
			else:
				poly_dict = poly_sage.dict()
			return messages.Poly([messages.Poly.Term(messages.Rational(fractions.Fraction(int(val.numerator()), int(val.denominator()))), {v : k for v, k in zip(var_strs, key)}) for key, val in poly_dict.items()])
		
		factors = poly_sage.factor()
		reply_msg = {"status" : "good", "factors" : [{"prime" : sage_poly_to_msg_poly(factors[i][0]).to_json(), "power" : int(factors[i][1])} for i in range(len(factors))]}
	except Exception as e:
		print(e)
		socket.send(json.dumps({"status" : "error", "traceback" : traceback.format_exc()}).encode("utf-8"))
	else:
		socket.send(json.dumps(reply_msg).encode("utf-8"))
