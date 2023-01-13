highp float pi = 3.14159265359;

highp float cosh(highp float x) {
	return (exp(x) + exp(-x)) / 2.0;
}

highp float sinh(highp float x) {
	return (exp(x) - exp(-x)) / 2.0;
}

highp float tanh(highp float x) {
	return sinh(x) / cosh(x);
}

highp vec3 circle_to_pp_stereographic(highp vec2 p) {
	if (p.x*p.x + p.y*p.y > 1.0) {
		return vec3(0, 0, 0);
	}
	highp float t = 2.0 / (p.x*p.x + p.y*p.y + 1.0);
	return vec3(p.x * t, p.y * t, t - 1.0);
}

highp vec3 circle_to_pp_orthogonal(highp vec2 p) {
	if (p.x*p.x + p.y*p.y > 1.0) {
		return vec3(0, 0, 0);
	}
	return vec3(p.x, p.y, sqrt(1.0 - p.x*p.x - p.y*p.y));
}

//return a vector perpendicular to v
highp vec3 get_perp(highp vec3 v) {
	if (v.z < 0.5) {
		return normalize(cross(v, vec3(0.0, 0.0, 1.0)));
	} else {
	  return normalize(cross(v, vec3(0.0, 1.0, 0.0)));
	}
}