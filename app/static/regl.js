/*
  tags: instancing, basic
  <p> In this example, it is shown how you can draw a bunch of bunny meshes using the
  instancing feature of regl. </p>
*/

//const mat4 = require('gl-mat4')
//const bunny = require('bunny')
//const fit = require('canvas-fit')
//const normals = require('angle-normals')

const regl_module = require('regl');
const fs = require('fs');



PlaneCanvas = class {
	constructor(canvas) {
		this.canvas = canvas;
		this.mouse_projective_pos = [0, 0, 0];
		this.rational_pt_info = [];
	}
	
	get_draw_points() {
		var draw_pts = []
		for (var i = 0; i < this.rational_pt_info.length; i += 1) {
			draw_pts.push({"point" : this.rational_pt_info[i]["pt"], "radius" : 1, "colour" : this.rational_pt_info[i]["colour"].concat([1])});
			draw_pts.push({"point" : this.rational_pt_info[i]["pt"], "radius" : 0.5, "colour" : [1, 1, 1, 1]});
		}
		if (this.mouse_projective_pos != [0, 0, 0]) {
			draw_pts.push({"point" : this.mouse_projective_pos, "radius" : 1, "colour" : [0, 0, 0, 1]});
		}
		return draw_pts
	}
	
	get_mouse_pos_pixels(evt) {  
		const bb = this.canvas.getBoundingClientRect();
		const x = Math.floor( (event.clientX - bb.left) / bb.width * this.canvas.width );
		const y = Math.floor( this.canvas.height - (event.clientY - bb.top) / bb.height * this.canvas.height );
		return [x, y];
	}
	
	pixels_to_projective(pixels) {  
		throw new Error("Not Implemented");
	}
	
	update_mousepos(mouse_pos) {
		this.mouse_projective_pos = mouse_pos;
		
		/*
		return;
		
		//for snapping to the graph:
		
		var oop = function (x, y, z) {
			return Math.pow(x*x+y*y-z*z, 2);
		}
		
		var pt = mouse_pos;
						
		for (var j = 0; j < 100; j += 1) {
			var d = 0.001;
			var dv = [(oop(pt[0]+d, pt[1], pt[2]) - oop(pt[0]-d, pt[1], pt[2])) / (2 * d),
					  (oop(pt[0], pt[1]+d, pt[2]) - oop(pt[0], pt[1]-d, pt[2])) / (2 * d),
					  (oop(pt[0], pt[1], pt[2]+d) - oop(pt[0], pt[1], pt[2]-d)) / (2 * d)];
					  
			var len = Math.sqrt(dv[0]*dv[0] + dv[1]*dv[1] + dv[1]*dv[1]);
			pt = [pt[0] - dv[0] / (1000*len), pt[1] - dv[1] / (1000*len), pt[2] - dv[2] / (1000*len)];
			var len = Math.sqrt(pt[0]*pt[0] + pt[1]*pt[1] + pt[1]*pt[1]);
			pt = [pt[0] / len, pt[1] / len, pt[2] / len];
		}
						
		this.mouse_projective_pos = pt;
		*/
	}
	
	update_curves(curve_info) {
		// curve_info should be a list of dics, each dict contains:
		// "glsl" : a string to be evaluated by glsl for evaluation. Should be a function in x, y, z
		// "colour" : a list of [r, g, b] values for the colour of the curve
	}
	
	update_rational_pts(rational_pt_info)
	{
		this.rational_pt_info = rational_pt_info;
	}

	add_rational_pts(rational_pt_info)
	{
		this.rational_pt_info = this.rational_pt_info.concat(rational_pt_info);
	}
		
}


window.AffineCanvas = class extends PlaneCanvas {
	constructor(canvas) {
		super(canvas);
		
		const affine_canvas = this;
		this.regl = regl_module({canvas: canvas, extensions: ['angle_instanced_arrays']})
		this.center = [0.000001, 0.000001]; //offset center to prevent glsl artifacts on grid lines
		this.zoom = 6;
		
		this.draw_curves = [];

		this.canvas.onmousewheel = function(event){
			event.preventDefault();
		};

		this.canvas.onwheel = function (event) {
			event.preventDefault();	
			var at_mouse_before = affine_canvas.pixels_to_coord(affine_canvas.get_mouse_pos_pixels(affine_canvas.canvas, event))
			affine_canvas.zoom *= Math.pow(0.999, -event.deltaY);
			if (affine_canvas.zoom < 0.01) {
				affine_canvas.zoom = 0.01;
			} else if (affine_canvas.zoom > 1000) {
				affine_canvas.zoom = 1000;
			}
			var at_mouse_after = affine_canvas.pixels_to_coord(affine_canvas.get_mouse_pos_pixels(affine_canvas.canvas, event));
			affine_canvas.center[0] += at_mouse_before[0] - at_mouse_after[0];
			affine_canvas.center[1] += at_mouse_before[1] - at_mouse_after[1];
		}
		
		var draw_grid = this.regl({
				vert: `
				attribute vec2 u_pos;

				varying highp vec2 coord;
				uniform highp vec2 canvas_size;
				uniform highp vec2 center;
				uniform highp float zoom;

				void main () {
					gl_Position = vec4(u_pos, 0, 1);
					coord = center+zoom*u_pos/2.0;
				}`,

				frag: fs.readFileSync(__dirname + "/funcs.glsl", "utf8") + `
				varying highp vec2 coord;
				uniform highp float zoom;
				uniform highp vec2 canvas_size;

				void main () {
					if (abs(mod(coord.x + 0.5, 1.0) - 0.5) < 0.5 * zoom / canvas_size.x || abs(mod(coord.y + 0.5, 1.0) - 0.5) < 0.5 * zoom / canvas_size.y) {
						highp float val = 1.0 - max(tanh(log(sqrt(canvas_size.x * canvas_size.y) / zoom) / 6.0), 0.0);
						gl_FragColor = vec4(val, val, val, 1);
					} else {
						gl_FragColor = vec4(1, 1, 1, 1);
					}
				}`,

		  attributes: {
			u_pos: [[1, 1], [1, -1], [-1, -1], [1, 1], [-1, 1], [-1, -1]]
		  },
		  
		  uniforms: {
			canvas_size: [canvas.width, canvas.height],
			zoom: this.regl.prop('zoom'),
			center: this.regl.prop('center')
		  },
		  
		  depth: {
			  enable: false
		  },

		  count: 6
		})
		
		
		var point_drawer = this.regl({
				vert: `
				attribute vec2 u_pos;

				uniform highp vec2 canvas_size;
				uniform highp vec2 center;
				uniform highp float zoom;
				uniform highp vec3 point;
				uniform highp float radius;

				void main () {
					highp vec2 point_tmp1 = vec2(point.x / point.z, point.y / point.z);
					highp vec2 point_tmp2 = 2.0 * (point_tmp1 - center) / zoom;
					gl_Position = vec4(point_tmp2 + radius * u_pos / 100.0, 0, 1);
				}`,

				frag: fs.readFileSync(__dirname + "/funcs.glsl", "utf8") + `				
				uniform highp vec4 colour;

				void main () {
					gl_FragColor = colour;
				}`,

		  attributes: {
			u_pos: [[0, 0], [0.0, 1.0], [0.5, 0.866],
			        [0, 0], [0.5, 0.866], [0.866, 0.5], 
			        [0, 0], [0.866, 0.5], [1.0, 0.0],
			        [0, 0], [1.0, 0.0], [0.866, -0.5],
			        [0, 0], [0.866, -0.5], [0.5, -0.866],
			        [0, 0], [0.5, -0.866], [0.0, -1.0], 
			        [0, 0], [0.0, -1.0], [-0.5, -0.866],
			        [0, 0], [-0.5, -0.866], [-0.866, -0.5],
			        [0, 0], [-0.866, -0.5], [-1.0, -0.0], 
			        [0, 0], [-1.0, -0.0], [-0.866, 0.5], 
			        [0, 0], [-0.866, 0.5], [-0.5, 0.866],
			        [0, 0], [-0.5, 0.866], [-0.0, 1.0]]
		  },
		  
		  uniforms: {
			canvas_size: [canvas.width, canvas.height],
			zoom: this.regl.prop('zoom'),
			center: this.regl.prop('center'),
			point: this.regl.prop('point'),
			radius: this.regl.prop('radius'),
			colour: this.regl.prop('colour'),
		  },
		  
		  depth: {
			  enable: false
		  },

		  count: 36
		})
		
		
		

		this.regl.frame(function () {
			affine_canvas.regl.clear({
				color: [0, 0, 0, 0]
			})
				  
			draw_grid({
				zoom : affine_canvas.zoom,
				center : affine_canvas.center,
			})
			
			for (var i = 0; i < affine_canvas.draw_curves.length; i++) {
				affine_canvas.draw_curves[i]({
					zoom : affine_canvas.zoom,
					center : affine_canvas.center
				})
			}
			
			var draw_points = affine_canvas.get_draw_points();
			for (var i = 0; i < draw_points.length; i++) {
				point_drawer({
					zoom : affine_canvas.zoom,
					center : affine_canvas.center,
					point : draw_points[i].point,
					radius : draw_points[i].radius,
					colour : draw_points[i].colour
				})
			}
			
		})
	
	}
	
	coord_to_pixels(coord) {
		return [(this.canvas.width / 2) + this.canvas.width * (coord[0] - this.center[0]) / this.zoom, 
		        (this.canvas.height / 2) + this.canvas.height * (coord[1] - this.center[1]) / this.zoom];
	}
	
	pixels_to_coord(pixels) {
		return [(pixels[0] - (this.canvas.width / 2)) * this.zoom / this.canvas.width + this.center[0], 
			    (pixels[1] - (this.canvas.height / 2)) * this.zoom / this.canvas.height + this.center[1]];
	}
	
	pixels_to_projective(pixels) {  
		var coord = this.pixels_to_coord(pixels);
		return [coord[0], coord[1], 1];
	}

	
	update_curves(curve_info) {		
		this.draw_curves = [];
		for (var i = 0; i < curve_info.length; i++) {
			this.draw_curves.push(this.regl({
				vert: `
				attribute vec2 u_pos;

				varying highp vec2 coord;
				uniform highp vec2 canvas_size;
				uniform highp vec2 center;
				uniform highp float zoom;

				void main () {
					gl_Position = vec4(u_pos, 0, 1);
					coord = center+zoom*u_pos/2.0;
				}`,

				frag: fs.readFileSync(__dirname + "/funcs.glsl", "utf8") + `
				varying highp vec2 coord;
				uniform highp float zoom;
				uniform highp vec2 canvas_size;
				uniform highp vec3 colour;

				highp float func(highp float x, highp float y, highp float z) {
					return ` + curve_info[i]["glsl"] + `;
				}

				void main () {
					int neg_count = 0;
					highp float a;
					for (int i = 0; i < 5; i++) {
						a = pi*float(i)/2.5;
						if (func(coord.x + 2.5 * sin(a) * zoom / canvas_size.x, coord.y + 2.5 * cos(a) * zoom / canvas_size.y, 1.0) < 0.0) {
							neg_count += 1;
						}
					}
					  
					if (neg_count == 0 || neg_count == 5) {
						discard;
					} else {
						gl_FragColor = vec4(colour, 1);
					}
				}`,

				attributes: {
					u_pos: [[1, 1], [1, -1], [-1, -1], [1, 1], [-1, 1], [-1, -1]]
				},

				uniforms: {
					canvas_size: [this.canvas.width, this.canvas.height],
					colour : curve_info[i]["colour"],
					zoom: this.regl.prop('zoom'),
					center: this.regl.prop('center')
				},

				depth: {
					enable: false
				},

				count: 6
			}))
		}
	}
}

window.ProjectiveCanvas = class extends PlaneCanvas {
	constructor(canvas) {
		super(canvas);
		
		const projective_canvas = this;
		this.regl = regl_module({canvas: canvas, extensions: ['angle_instanced_arrays']})
		var Quaternion = require('quaternion');
		this.angle = Quaternion(1, 0, 0, 0);	//represent the rotation of the projective plane using a unit quaternion
		
		this.draw_curves = [];
		
		addEventListener('mousemove', (event) => {
			if (event.target == canvas && (event.buttons & 1)) { //click and drag within the canvas	
				//idk why i=y and j=x but thats just how it do be
				var di = Math.tanh(event.movementY / 100)/2;
				var dj = Math.tanh(event.movementX / 100)/2;
				var dk = 0;
				var dr = Math.sqrt(1-di*di-dj*dj-dk*dk);
				var d_angle = Quaternion(dr, di, dj, dk);
				projective_canvas.angle = d_angle.mul(projective_canvas.angle);
				projective_canvas.angle = projective_canvas.angle.normalize();		
			}
		})
	
		var draw_grid = this.regl({
			vert: `
			attribute vec2 u_pos;
			varying highp vec2 pos;
		  
			void main () {
				pos = u_pos;
				gl_Position = vec4(u_pos, 0, 1);
			}`,
		  
			frag: fs.readFileSync(__dirname + "/funcs.glsl", "utf8") + `
			varying highp vec2 pos;
			uniform highp mat3 angle;
		  
			void main () {
				highp vec3 s_pos = circle_to_pp_stereographic(pos);
				if (s_pos.x == 0.0 && s_pos.y == 0.0 && s_pos.z == 0.0) {
					discard;
				}
			
				s_pos = angle * s_pos;
			
				if ((abs(mod(s_pos.x / s_pos.z + 0.5, 1.0) - 0.5) < 0.003 / abs(s_pos.z)) || (abs(mod(s_pos.y / s_pos.z + 0.5, 1.0) - 0.5) < 0.003 / abs(s_pos.z))) {
					highp float val = 1.0-0.8*abs(s_pos.z);
					gl_FragColor = vec4(val, val, val, 1);
				} else {
					gl_FragColor = vec4(1, 1, 1, 1);
				}
				
			}`,

			attributes: {
				u_pos: [[1, 1], [1, -1], [-1, -1], [1, 1], [-1, 1], [-1, -1]]
			},
		  
			uniforms: {
				canvas_size: [canvas.width, canvas.height],
				angle: this.regl.prop('angle'),
			},
		  
			depth: {
				enable: false
			},

			count: 6
		})
		
		var point_drawer = this.regl({
				vert: `
				attribute vec2 u_pos;

				uniform highp vec2 canvas_size;
				uniform highp mat3 angle_inv;
				uniform highp vec3 point;
				uniform highp float radius;

				void main () {
					highp vec3 point_tmp1 = angle_inv * normalize(point);
					if (point_tmp1.z < 0.0) {
						point_tmp1 = -point_tmp1;
					}
					highp vec2 point_tmp2 = vec2(point_tmp1.x / (point_tmp1.z + 1.0), point_tmp1.y / (point_tmp1.z + 1.0));
					gl_Position = vec4(point_tmp2 + radius * u_pos / 100.0, 0, 1);
				}`,

				frag: fs.readFileSync(__dirname + "/funcs.glsl", "utf8") + `				
				uniform highp vec4 colour;

				void main () {
					gl_FragColor = colour;
				}`,

		  attributes: {
			u_pos: [[0, 0], [0.0, 1.0], [0.5, 0.866],
			        [0, 0], [0.5, 0.866], [0.866, 0.5], 
			        [0, 0], [0.866, 0.5], [1.0, 0.0],
			        [0, 0], [1.0, 0.0], [0.866, -0.5],
			        [0, 0], [0.866, -0.5], [0.5, -0.866],
			        [0, 0], [0.5, -0.866], [0.0, -1.0], 
			        [0, 0], [0.0, -1.0], [-0.5, -0.866],
			        [0, 0], [-0.5, -0.866], [-0.866, -0.5],
			        [0, 0], [-0.866, -0.5], [-1.0, -0.0], 
			        [0, 0], [-1.0, -0.0], [-0.866, 0.5], 
			        [0, 0], [-0.866, 0.5], [-0.5, 0.866],
			        [0, 0], [-0.5, 0.866], [-0.0, 1.0]]
		  },
		  
		  uniforms: {
			canvas_size: [canvas.width, canvas.height],
			angle_inv: this.regl.prop('angle_inv'),
			point: this.regl.prop('point'),
			radius: this.regl.prop('radius'),
			colour: this.regl.prop('colour'),
		  },
		  
		  depth: {
			  enable: false
		  },

		  count: 36
		})

		this.regl.frame(function () {			
			projective_canvas.regl.clear({
				color: [0, 0, 0, 0]
			})
				  
			draw_grid({
				angle : projective_canvas.angle.toMatrix(),
			})
			
			for (var i = 0; i < projective_canvas.draw_curves.length; i++) {
				projective_canvas.draw_curves[i]({
					angle : projective_canvas.angle.toMatrix()
				})
			}
			
			var draw_points = projective_canvas.get_draw_points();
			for (var i = 0; i < draw_points.length; i++) {
				point_drawer({
					angle_inv : projective_canvas.angle.inverse().toMatrix(),
					point : draw_points[i].point,
					radius : draw_points[i].radius,
					colour : draw_points[i].colour
				})
			}
			
		})
	}
	
	update_curves(curve_info) {		
		this.draw_curves = [];
		for (var i = 0; i < curve_info.length; i++) {
			this.draw_curves.push(this.regl({
					vert: `
					attribute vec2 u_pos;
					varying highp vec2 pos;

					void main () {
					pos = u_pos;
					gl_Position = vec4(u_pos, 0, 1);
					}`,

					frag: fs.readFileSync(__dirname + "/funcs.glsl", "utf8") + `
					varying highp vec2 pos;
					uniform highp mat3 angle;
					uniform highp vec3 colour;

					highp float func(highp vec3 v) {
					  highp float x = v.x;
					  highp float y = v.y;
					  highp float z = v.z;
					  return ` + curve_info[i]["glsl"] + `;
					}

					void main () {
					highp vec3 s_pos = circle_to_pp_stereographic(pos);
					if (s_pos.x == 0.0 && s_pos.y == 0.0 && s_pos.z == 0.0) {
						discard;
					}
					
					s_pos = angle * s_pos;
					
					int count = 0;
					if (s_pos.x < 0.0) {
						count += 1;
					}
					if (s_pos.y < 0.0) {
						count += 1;
					}
					if (s_pos.z < 0.0) {
						count += 1;
					}
					
					highp vec3 S = get_perp(s_pos);
					highp vec3 T = cross(S, s_pos);
					
					int neg_count = 0;
					highp float a;
					for (int i = 0; i < 5; i++) {
						a = pi*float(i)/2.5;
						if (func(s_pos + cos(a) * S / 150.0 + sin(a) * T / 150.0) < 0.0) {
							neg_count += 1;
						}
					}
					
					if (neg_count == 0 || neg_count == 5) {
						discard;
					} else {
						gl_FragColor = vec4(colour, 1);
					}
						
				}`,

				attributes: {
				u_pos: [[1, 1], [1, -1], [-1, -1], [1, 1], [-1, 1], [-1, -1]]
				},

				uniforms: {
				canvas_size: [this.canvas.width, this.canvas.height],
				colour: curve_info[i]["colour"],
				angle: this.regl.prop('angle'),
				},

				depth: {
				  enable: false
				},

				count: 6
			}))
		}
	}
	
	pixels_to_projective(pixels) {
		//this is for stereographic NOT orthogonal
		var x = 2 * pixels[0] / this.canvas.width - 1;
		var y = 2 * pixels[1] / this.canvas.height - 1;
		if (x*x + y*y > 1.0) {
			return [0, 0, 0];
		}
		var t = 2 / (x*x + y*y + 1);
		return this.angle.inverse().rotateVector([x * t, y * t, t - 1]);
	}
}



window.CanvasManager = class {
	constructor(canvases) {
		this.canvases = canvases;
		const canvas_manager = this;
		
		addEventListener('mousemove', (event) => {
			
			var current_mouse_location = -1;
			var in_some_canvas = false;
			for (var i = 0; i < canvas_manager.canvases.length; i += 1) {
				if (event.target == canvas_manager.canvases[i].canvas) {
					current_mouse_location = i;
					in_some_canvas = true;
				}
			}
			
						
			if (in_some_canvas) {
				canvas_manager.update_mousepos(
					canvas_manager.canvases[current_mouse_location].pixels_to_projective(
						canvas_manager.canvases[current_mouse_location].get_mouse_pos_pixels(event)
					)
				);
			} else {
				canvas_manager.update_mousepos([0, 0, 0]);
			}
			
		
		})
	}
	
	update_mousepos(mouse_pos) {
		// [0, 0, 0] for no mouse pos
		for (var i = 0; i < this.canvases.length; i += 1) {
			this.canvases[i].update_mousepos(mouse_pos);
		}
	}
	
	update_curves(curve_info) {
		for (var i = 0; i < this.canvases.length; i += 1) {
			this.canvases[i].update_curves(curve_info);
		}
	}
	
	update_rational_pts(rational_pt_info) {
		for (var i = 0; i < this.canvases.length; i += 1) {
			this.canvases[i].update_rational_pts(rational_pt_info);
		}
	}

	add_rational_pts(rational_pt_info) {
		for (var i = 0; i < this.canvases.length; i += 1) {
			this.canvases[i].add_rational_pts(rational_pt_info);
		}
	}
}