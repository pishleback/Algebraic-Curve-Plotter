import messages
from fractions import Fraction
import typing

class Rational(messages.Message):
    @classmethod
    def from_string(cls, string):
        if not "/" in string:
            try:
                return cls(Fraction(int(string), 1))
            except ValueError as e:
                raise messages.ParseError(string)
        elif string.count("/") == 1:
            n, d = string.split("/")
            try:
                n, d = int(n), int(d)
            except ValueError as e:
                raise messages.ParseError(str(e))
            if d == 0:
                raise messages.ParseError("denominator cant be zero")
            return cls(Fraction(n, d))
        else:
            raise messages.ParseError()

    @classmethod
    def from_json(cls, json):
        if type(json) != list:
            raise messages.ParseError()
        if len(json) != 2:
            raise messages.ParseError()
        n, d = json
        if type(n) != int or type(d) != int:
            raise messages.ParseError()
        if d == 0:
            raise messages.ParseError()
        return cls(Fraction(n, d))
    
    def __init__(self, frac):
        assert type(frac) == Fraction
        self.frac = frac

    def to_frac(self):
        return self.frac

    def to_string(self):
        if self.frac.denominator == 1:
            return str(self.frac.numerator)
        else:
            return str(self.frac.numerator) + "/" + str(self.frac.denominator)

    def to_mathjax(self):
        if self.frac.denominator == 1:
            return str(self.frac.numerator)
        if self.frac < 0:
            return R"-\frac{" + str(-self.frac.numerator) + "}{" + str(self.frac.denominator) + "}"
        else:
            return R"\frac{" + str(self.frac.numerator) + "}{" + str(self.frac.denominator) + "}"

    def to_json(self):
        return [self.frac.numerator, self.frac.denominator]


class Poly(messages.Message):
    VARNAMES : str = "abcdefghijklmnopqrstuvwxyz"
    @classmethod
    def from_string(cls, string : str):
        #a polynomial string shall be a sum ("+"/"-" seperated) of products (implicit seperator) of:
        #   integers
        #   fractions
        #   variables
        #   another polynomial string enclosed in "(" and ")"

        # =parse the sum=
        string = "+" + string.replace(" ", "")
        #contains [sign, expression_string] #sign=False means +, sign=True means -
        depth : int = 0 #bracket depth
        parts = [[False, ""]]
        for idx, letter in enumerate(string):
            if letter == "(":
                depth += 1
            if letter == ")":
                depth -= 1
            if depth < 0:
                raise messages.ParseError()
            if (letter == "+" or letter == "-") and depth == 0:
                if len(parts[-1][1]) > 0:
                    parts.append([False, ""])
                if letter == "-":
                    parts[-1][0] = not parts[-1][0]
            else:
                parts[-1][1] += letter
        if depth != 0:
            raise messages.ParseError()

        acc_sum = cls.zero()
        for sign, term in parts:
            acc_prod = cls.one()
            # =parse the product=

            acc_term = ""
            idx = 0
            while idx < len(term):
                letter = term[idx]
                if idx + 1 < len(term):
                    next_letter = term[idx + 1]
                else:
                    next_letter = None
                acc_term += letter
                
                natural_chars = ["0", "1", "2", "3", "4", "5", "6", "7", "8", "9"]        

                factor = None
                if acc_term in cls.VARNAMES:
                    #variable
                    factor = cls([cls.Term(Rational(Fraction(1, 1)), {acc_term : 1})])
                if all(l in natural_chars + ["/"] for l in acc_term) and not next_letter in natural_chars + ["/"]:
                    #int or frac
                    if not "/" in acc_term:
                        factor = cls([cls.Term(Rational(Fraction(int(acc_term), 1)), {})])
                    elif acc_term.count("/") == 1:
                        n, d = acc_term.split("/")
                        factor = cls([cls.Term(Rational(Fraction(int(n), int(d))), {})])
                    else:
                        raise messages.ParseError()
                    
                if acc_term.count("(") == acc_term.count(")") >= 1:
                    if acc_term[0] != "(" or acc_term[-1] != ")":
                        raise messages.ParseError()
                    factor = cls.from_string(acc_term[1:-1])

                idx += 1
                    
                if not factor is None:
                    if next_letter == "^":
                        idx += 1
                        power = ""
                        while idx < len(term):
                            letter = term[idx]
                            if not letter in natural_chars:
                                break
                            power += letter
                            idx += 1
                        if len(power) == 0:
                            raise messages.ParseError()
                        acc_prod = acc_prod * factor ** int(power)
                    else:
                        acc_prod = acc_prod * factor
                    acc_term = ""

                
            if len(acc_term) > 0:
                raise messages.ParseError(f"Can't parse term \"{acc_term}\"")
            
            if sign:
                acc_sum = acc_sum + (-acc_prod)
            else:
                acc_sum = acc_sum + acc_prod

        return acc_sum
        
    @classmethod
    def from_json(cls, json):
        if type(json) != list:
            raise messages.ParseError()
        return cls(cls.Term.from_json(term) for term in json)
        
    class Term(messages.Message):
        @classmethod
        def from_json(cls, json):
            return cls(Rational.from_json(json["coeff"]), json["powers"])
    
        def __init__(self, coeff, powers):
            assert type(coeff) == Rational
            assert type(powers) == dict
            powers = {v : k for v, k in powers.items() if k != 0}
            for v, k in powers.items():
                assert v in Poly.VARNAMES
                assert type(k) == int and k >= 1
            self.coeff = coeff
            self.powers = powers

        def __mul__(self, other):
            if (cls := type(self)) == type(other):
                powers = {v : 0 for v in self.powers.keys() | other.powers.keys()}
                for v, k in self.powers.items():
                    powers[v] += k
                for v, k in other.powers.items():
                    powers[v] += k
                return cls(Rational(self.coeff.frac * other.coeff.frac), powers)
            return NotImplemented

        def to_json(self):
            return {"coeff" : self.coeff.to_json(), "powers" : self.powers}

        def to_mathjax(self):
            if self.coeff.frac == 1 and len(self.powers) > 0:
                mj = "+"
            elif self.coeff.frac == -1 and len(self.powers) > 0:
                mj = "-"
            elif self.coeff.frac >= 0:
                mj = "+" + self.coeff.to_mathjax()
            else:
                mj = self.coeff.to_mathjax()
            for v, p in self.powers.items():
                if p == 1:
                    mj += v
                else:
                    mj += v + "^{" + str(p) + "}"
            return mj

        def to_glsl(self, var_names):
            glsl_prod = []
            f = self.coeff.frac
            glsl_prod.append("(" + str(f.numerator) + ".0" + "/" + str(f.denominator) + ".0" + ")")
            for v, p in self.powers.items():
                try:
                    glsl_v = var_names[v]
                except KeyError:
                    raise messages.ParseError()
                else:
                    glsl_prod.append("*".join(var_names[v] for _ in range(p)))
            return "*".join(glsl_prod)
        
        def eval(self, inputs, convert_frac):
            ans = convert_frac(self.coeff.frac)
            for v, p in self.powers.items():
                ans *= inputs[v] ** p
            return ans

        def vars(self):
            return set(self.powers.keys())

        def degree(self):
            return sum(p for v, p in self.powers.items())

        def is_zero(self):
            return self.coeff.frac == 0

    @classmethod
    def zero(cls):
        return cls([])

    @classmethod
    def one(cls):
        return cls([cls.Term(Rational(Fraction(1, 1)), {})])
            
    def __init__(self, terms):
        terms = tuple(terms)
        for term in terms:
            assert type(term) == Poly.Term
        self.terms = []
        for term in terms:
            for existing_term in self.terms:
                if existing_term.powers == term.powers:
                    existing_term.coeff = Rational(existing_term.coeff.frac + term.coeff.frac)
                    break
            else:
                self.terms.append(term)
        self.terms = [term for term in self.terms if not term.is_zero()]

    def __add__(self, other):
        if (cls := type(self)) == type(other):
            return cls(self.terms + other.terms)
        return NotImplemented

    def __neg__(self):
        return type(self)([type(self).Term(Rational(-term.coeff.frac), term.powers) for term in self.terms])

    def __mul__(self, other):
        if (cls := type(self)) == type(other):
            terms = []
            for self_term in self.terms:
                for other_term in other.terms:
                    terms.append(self_term * other_term)
            return cls(terms)
        return NotImplemented

    def __pow__(self, other):
        if type(other) == int:
            ans = type(self).one()
            for _ in range(other):
                ans = ans * self
            return ans
        return NotImplemented

    def eval(self, inputs, *, convert_frac = lambda frac : frac):
        ans = convert_frac(Fraction(0, 1))
        for term in self.terms:
            ans += term.eval(inputs, convert_frac)
        return ans

    def to_mathjax(self):
        if self.is_zero():
            return "0"
        mj = "".join(term.to_mathjax() for term in self.terms)
        if mj[0] == "+":
            mj = mj[1:]
        return mj

    def to_glsl(self, var_names):
        if self.is_zero():
            return "0.0"
        return "+".join(term.to_glsl(var_names) for term in self.terms)
        
    def to_json(self):
        return [term.to_json() for term in self.terms]

    def vars(self):
        vs = set()
        for term in self.terms:
            vs |= term.vars()
        return vs

    def num_terms(self):
        return len(self.terms)

    def degree(self):
        return max(term.degree() for term in self.terms)

    def is_zero(self):
        return len(self.terms) == 0

    def homogenize(self, v):
        d = self.degree()
        assert not v in self.vars()
        return Poly([Poly.Term(term.coeff, term.powers | {v : d - term.degree()}) for term in self.terms])
        
