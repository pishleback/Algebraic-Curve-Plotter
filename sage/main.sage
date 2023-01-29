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




def find_rational_points(P2, poly, var_strs):
	import time
	from sage.schemes.projective.projective_rational_point import enum_projective_rational_field
	C = P2.subscheme([poly])
		
	pts = []
	start_time = time.time()
	h = 12
	while time.time() - start_time < 2:
		pts = enum_projective_rational_field(C(QQ), h)
		h += 1
	print(h)
	return pts
		

class ErrorMessage(Exception):
	pass


while True:
	try:
		request_msg = json.loads(socket.recv().decode("utf-8"))		
		poly_msg = messages.Poly.from_json(request_msg["polynomial"])
		msg_vars = poly_msg.vars()
		for mv in msg_vars:
			assert mv in {"x", "y", "z"}
			
		var_strs = ["x", "y", "z"]
		
		if poly_msg.is_zero():
			raise ErrorMessage("The polynomial should be non-zero")
		elif len(var_strs) == 0:
			reply_msg = {"status" : "good", "factors" : [], "rational_points" : []}
		else:
			P2, vars = ProjectiveSpace(2, QQ).objgens()
			R = P2.coordinate_ring()
			
			vars_sage = R.gens()	
			def convert_frac(frac):
				return Integer(frac.numerator) / Integer(frac.denominator)
			poly_sage = poly_msg.eval({v_str : v_sage for v_str, v_sage in zip(var_strs, vars_sage)}, convert_frac = convert_frac)
	
						
			def sage_frac_to_msg_frac(c):
				return messages.Rational(fractions.Fraction(int(c.numerator()), int(c.denominator())))
				
			def sage_poly_to_msg_poly(poly_sage):
				#poly_dict contains {(v1_pow : int, v2_pow : int, ..., vn_pow : int) : coeff}
				poly_dict = poly_sage.dict()
				#handle univariate and multivariate seperately, becasue.dict returns different things
				if len(vars_sage) == 1:
					assert False #should never happen now that we always make sure we have x, y, z as the variables
					poly_dict = {(power,) : coeff for power, coeff in poly_dict.items()}
				else:
					poly_dict = poly_sage.dict()
				return messages.Poly([messages.Poly.Term(sage_frac_to_msg_frac(val), {v : k for v, k in zip(var_strs, key)}) for key, val in poly_dict.items()])
						
			factors = poly_sage.factor()
			reply_msg = {"status" : "good", 
			             "factors" : [{"prime" : sage_poly_to_msg_poly(factors[i][0]).to_json(), "power" : int(factors[i][1])} for i in range(len(factors))],
						 "rational_points" : [[sage_frac_to_msg_frac(p[i]).to_json() for i in range(3)] for p in find_rational_points(P2, poly_sage.homogenize(vars[2]), var_strs)]}
	except ErrorMessage as e:
		socket.send(json.dumps({"status" : "error_message", "message" : str(e), "traceback" : traceback.format_exc()}).encode("utf-8"))
	except Exception as e:
		socket.send(json.dumps({"status" : "fatal_error", "traceback" : traceback.format_exc()}).encode("utf-8"))
	else:
		socket.send(json.dumps(reply_msg).encode("utf-8"))
