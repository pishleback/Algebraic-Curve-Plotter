import json
import zmq
import messages
import sage_messages
import fractions
import traceback
import math
import multiprocessing
import time





def process_func(msg):
	user_id = msg["user_id"]
	poly_json = msg["polynomial"]

	from sage.schemes.projective.projective_rational_point import enum_projective_rational_field
	import random


	P2, vars = ProjectiveSpace(2, QQ).objgens()
	R = P2.coordinate_ring()
	x, y, z = R.gens()

	poly_msg = sage_messages.Poly.from_json(poly_json)
	msg_vars = poly_msg.vars()
	for mv in msg_vars:
		assert mv in {"x", "y", "z"}
	var_strs = ["x", "y", "z"]

	if poly_msg.is_zero():
		raise ErrorMessage("The polynomial should be non-zero")
	else:

		vars_sage = R.gens()	
		def convert_frac(frac):
			return Integer(frac.numerator) / Integer(frac.denominator)
		poly_sage = poly_msg.eval({v_str : v_sage for v_str, v_sage in zip(var_strs, vars_sage)}, convert_frac = convert_frac)
		poly_sage = poly_sage.homogenize(z)

		C = P2.subscheme([poly_sage])

		zmq_ctx = zmq.Context()
		socket = zmq_ctx.socket(zmq.REQ)
		socket.connect("tcp://web:5556")

		socket.send(json.dumps({
					"user_id" : user_id,
					"command" : "clear"}).encode("utf-8"))
		socket.recv()
		
		pts = set()
		for h in range(100):
			print("enum_projective_rational_field", h)
			for pt in enum_projective_rational_field(C(QQ), h):
				if not pt in pts:
					pts.add(pt)
					socket.send(json.dumps({
					"user_id" : user_id,
					"command" : "add",
					"rational_point": {
					"pt" : [float(pt[0]), float(pt[1]), float(pt[2])],
					"colour" : [int(0), int(0), int(1)]
					}}).encode("utf-8"))
					socket.recv()


	#raise Exception("poop")



def find_rational_points(P2, poly, var_strs):
	return []	
	import time
	from sage.schemes.projective.projective_rational_point import enum_projective_rational_field
	C = P2.subscheme([poly])
		
	pts = []
	start_time = time.time()
	h = 6
	while time.time() - start_time < 2:
		pts = enum_projective_rational_field(C(QQ), h)
		h += 1
	print(h)
	return pts

		

class ErrorMessage(Exception):
	pass



def process_default(msg):
	P2, vars = ProjectiveSpace(2, QQ).objgens()
	R = P2.coordinate_ring()
	x, y, z = R.gens()




	# p = multiprocessing.Process(target=process_func, args=(msg,))
	# p.start()
	# print("process started")
	# #p.join()
	# print("process joined")
	# if p.exitcode is None:
	# 	print("stillgoing")
	# elif p.exitcode != 0:
	# 	print("error")
	# else:
	# 	print("no error")


	#try to phase this part out, replace with seperate commands

	#factor polynomial
	#find rational points up to height H

	poly_msg = sage_messages.Poly.from_json(msg["polynomial"])
	msg_vars = poly_msg.vars()
	for mv in msg_vars:
		assert mv in {"x", "y", "z"}
		
	var_strs = ["x", "y", "z"]
	
	if poly_msg.is_zero():
		raise ErrorMessage("The polynomial should be non-zero")
	elif len(var_strs) == 0:
		return {"status" : "good", "factors" : [], "rational_points" : []}
	else:
		
		vars_sage = R.gens()	
		def convert_frac(frac):
			return Integer(frac.numerator) / Integer(frac.denominator)
		poly_sage = poly_msg.eval({v_str : v_sage for v_str, v_sage in zip(var_strs, vars_sage)}, convert_frac = convert_frac)

		
		def sage_frac_to_msg_frac(c):
			return sage_messages.Rational(fractions.Fraction(int(c.numerator()), int(c.denominator())))
			
		def sage_poly_to_msg_poly(poly_sage):
			#poly_dict contains {(v1_pow : int, v2_pow : int, ..., vn_pow : int) : coeff}
			poly_dict = poly_sage.dict()
			#handle univariate and multivariate seperately, becasue.dict returns different things
			if len(vars_sage) == 1:
				assert False #should never happen now that we always make sure we have x, y, z as the variables
				poly_dict = {(power,) : coeff for power, coeff in poly_dict.items()}
			else:
				poly_dict = poly_sage.dict()
			return sage_messages.Poly([sage_messages.Poly.Term(sage_frac_to_msg_frac(val), {v : k for v, k in zip(var_strs, key)}) for key, val in poly_dict.items()])
					
		factors = poly_sage.factor()
		return {"status" : "good", 
					"factors" : [{"prime" : sage_poly_to_msg_poly(factors[i][0]).to_json(), "power" : int(factors[i][1])} for i in range(len(factors))],
					"rational_points" : [[sage_frac_to_msg_frac(p[i]).to_json() for i in range(3)] for p in find_rational_points(P2, poly_sage.homogenize(vars[2]), var_strs)]}
			


def main():
	zmq_ctx = zmq.Context()
	socket = zmq_ctx.socket(zmq.REP)
	socket.bind("tcp://0.0.0.0:5555")

	while True:
		try:
			request_msg = json.loads(socket.recv().decode("utf-8"))

			if request_msg["command"] == "default":
				reply_msg = process_default(request_msg["params"])
			else:
				raise Exception("Unknown command")
		
		
		except ErrorMessage as e:
			socket.send(json.dumps({"status" : "error_message", "message" : str(e), "traceback" : traceback.format_exc()}).encode("utf-8"))
		except Exception as e:
			socket.send(json.dumps({"status" : "fatal_error", "traceback" : traceback.format_exc()}).encode("utf-8"))
		else:
			socket.send(json.dumps(reply_msg).encode("utf-8"))



if __name__ == "__main__":
	main()