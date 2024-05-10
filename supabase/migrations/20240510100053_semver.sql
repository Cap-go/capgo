SET client_min_messages TO warning;
SET log_min_messages    TO warning;

-- Create a semantic version data type.
--
-- https://semver.org/.
--

-- 1. A normal version number MUST take the form X.Y.Z where X, Y, and Z are
-- integers. X is the major version, Y is the minor version, and Z is the
-- patch version. Each element MUST increase numerically. For instance: 1.9.0
-- < 1.10.0 < 1.11.0.
--
-- 2. A special version number MAY be denoted by appending an arbitrary string
-- immediately following the patch version. The string MUST be comprised of
-- only alphanumerics plus dash [0-9A-Za-z-] and MUST begin with an alpha
-- character [A-Za-z]. Special versions satisfy but have a lower precedence
-- than the associated normal version. Precedence SHOULD be determined by
-- lexicographic ASCII sort order. For instance: 1.0.0beta1 < 1.0.0beta2 <
-- 1.0.0.

CREATE TYPE semver;

--
-- essential IO
--
CREATE OR REPLACE FUNCTION semver_in(cstring)
	RETURNS semver
	AS 'MODULE_PATHNAME'
	LANGUAGE C STRICT IMMUTABLE;

CREATE OR REPLACE FUNCTION semver_out(semver)
	RETURNS cstring
	AS 'MODULE_PATHNAME'
	LANGUAGE C STRICT IMMUTABLE;

CREATE OR REPLACE FUNCTION semver_recv(internal)
    RETURNS semver
    AS 'MODULE_PATHNAME'
    LANGUAGE C STRICT IMMUTABLE;

CREATE OR REPLACE FUNCTION semver_send(semver)
    RETURNS bytea
    AS 'MODULE_PATHNAME'
    LANGUAGE C STRICT IMMUTABLE;

--
--  The type itself.
--

CREATE TYPE semver (
	INPUT = semver_in,
	OUTPUT = semver_out,
	RECEIVE = semver_recv,
	SEND = semver_send,
	-- values of passedbyvalue and alignment are copied from the named type.
    STORAGE = plain,
	INTERNALLENGTH = variable,
	-- string category, to automatically try string conversion, etc.
	CATEGORY = 'S',
	PREFERRED = false
);

--
--  A lax constructor function.
--

CREATE OR REPLACE FUNCTION to_semver(text)
	RETURNS semver
	AS 'MODULE_PATHNAME'
	LANGUAGE C STRICT IMMUTABLE;

--
--  Typecasting functions.
--

CREATE OR REPLACE FUNCTION semver(text)
	RETURNS semver
    AS 'MODULE_PATHNAME', 'text_to_semver'
	LANGUAGE C STRICT IMMUTABLE;

CREATE OR REPLACE FUNCTION text(semver)
	RETURNS text
    AS 'MODULE_PATHNAME', 'semver_to_text'
	LANGUAGE C STRICT IMMUTABLE;

CREATE OR REPLACE FUNCTION semver(numeric)
	RETURNS semver AS $$ SELECT to_semver($1::text) $$
    LANGUAGE SQL STRICT IMMUTABLE;

CREATE OR REPLACE FUNCTION semver(real)
	RETURNS semver AS $$ SELECT to_semver($1::text) $$
    LANGUAGE SQL STRICT IMMUTABLE;

CREATE OR REPLACE FUNCTION semver(double precision)
	RETURNS semver AS $$ SELECT to_semver($1::text) $$
    LANGUAGE SQL STRICT IMMUTABLE;

CREATE OR REPLACE FUNCTION semver(integer)
	RETURNS semver AS $$ SELECT to_semver($1::text) $$
    LANGUAGE SQL STRICT IMMUTABLE;

CREATE OR REPLACE FUNCTION semver(smallint)
	RETURNS semver AS $$ SELECT to_semver($1::text) $$
    LANGUAGE SQL STRICT IMMUTABLE;

CREATE OR REPLACE FUNCTION semver(bigint)
	RETURNS semver AS $$ SELECT to_semver($1::text) $$
    LANGUAGE SQL STRICT IMMUTABLE;

--
--  Explicit type casts.
--

CREATE CAST (semver AS text)             WITH FUNCTION text(semver);
CREATE CAST (text AS semver)             WITH FUNCTION semver(text);
CREATE CAST (numeric AS semver)          WITH FUNCTION semver(numeric);
CREATE CAST (real AS semver)             WITH FUNCTION semver(real);
CREATE CAST (double precision AS semver) WITH FUNCTION semver(double precision);
CREATE CAST (integer AS semver)          WITH FUNCTION semver(integer);
CREATE CAST (smallint AS semver)         WITH FUNCTION semver(smallint);
CREATE CAST (bigint AS semver)           WITH FUNCTION semver(bigint);

--
--	Comparison functions and their corresponding operators.
--

CREATE OR REPLACE FUNCTION semver_eq(semver, semver)
	RETURNS bool
	AS 'MODULE_PATHNAME'
	LANGUAGE C STRICT IMMUTABLE;

CREATE OPERATOR = (
	leftarg = semver,
	rightarg = semver,
	negator = <>,
	procedure = semver_eq,
	restrict = eqsel,
	commutator = =,
	join = eqjoinsel,
	hashes, merges
);

CREATE OR REPLACE FUNCTION semver_ne(semver, semver)
	RETURNS bool
	AS 'MODULE_PATHNAME'
	LANGUAGE C STRICT IMMUTABLE;

CREATE OPERATOR <> (
	leftarg = semver,
	rightarg = semver,
	negator = =,
	procedure = semver_ne,
	restrict = neqsel,
	join = neqjoinsel
);

CREATE OR REPLACE FUNCTION semver_le(semver, semver)
	RETURNS bool
	AS 'MODULE_PATHNAME'
	LANGUAGE C STRICT IMMUTABLE;

CREATE OPERATOR <= (
	leftarg = semver,
	rightarg = semver,
	negator = >,
	procedure = semver_le
);

CREATE OR REPLACE FUNCTION semver_lt(semver, semver)
	RETURNS bool
	AS 'MODULE_PATHNAME'
	LANGUAGE C STRICT IMMUTABLE;

CREATE OPERATOR < (
	leftarg = semver,
	rightarg = semver,
	negator = >=,
	procedure = semver_lt
);

CREATE OR REPLACE FUNCTION semver_ge(semver, semver)
	RETURNS bool
	AS 'MODULE_PATHNAME'
	LANGUAGE C STRICT IMMUTABLE;

CREATE OPERATOR >= (
	leftarg = semver,
	rightarg = semver,
	negator = <,
	procedure = semver_ge
);

CREATE OR REPLACE FUNCTION semver_gt(semver, semver)
	RETURNS bool
	AS 'MODULE_PATHNAME'
	LANGUAGE C STRICT IMMUTABLE;

CREATE OPERATOR > (
	leftarg = semver,
	rightarg = semver,
	negator = <=,
	procedure = semver_gt
);

--
-- Support functions for indexing.
--

CREATE OR REPLACE FUNCTION semver_cmp(semver, semver)
	RETURNS int4
	AS 'MODULE_PATHNAME'
	LANGUAGE C STRICT IMMUTABLE;

CREATE OR REPLACE FUNCTION hash_semver(semver)
	RETURNS int4
	AS 'MODULE_PATHNAME'
	LANGUAGE C STRICT IMMUTABLE;

--
-- The btree indexing operator class.
--

CREATE OPERATOR CLASS semver_ops
DEFAULT FOR TYPE SEMVER USING btree AS
    OPERATOR    1   <  (semver, semver),
    OPERATOR    2   <= (semver, semver),
    OPERATOR    3   =  (semver, semver),
    OPERATOR    4   >= (semver, semver),
    OPERATOR    5   >  (semver, semver),
    FUNCTION    1   semver_cmp(semver, semver);

--
-- The hash indexing operator class.
--

CREATE OPERATOR CLASS semver_ops
DEFAULT FOR TYPE semver USING hash AS
    OPERATOR    1   =  (semver, semver),
    FUNCTION    1   hash_semver(semver);

--
-- Aggregates.
--

CREATE OR REPLACE FUNCTION semver_smaller(semver, semver)
	RETURNS semver
	AS 'MODULE_PATHNAME'
	LANGUAGE C STRICT IMMUTABLE;

CREATE AGGREGATE min(semver)  (
    SFUNC = semver_smaller,
    STYPE = semver,
    SORTOP = <
);

CREATE OR REPLACE FUNCTION semver_larger(semver, semver)
	RETURNS semver
	AS 'MODULE_PATHNAME'
	LANGUAGE C STRICT IMMUTABLE;

CREATE AGGREGATE max(semver)  (
    SFUNC = semver_larger,
    STYPE = semver,
    SORTOP = >
);

--
-- Is function.
--

CREATE OR REPLACE FUNCTION is_semver(text)
	RETURNS bool
	AS 'MODULE_PATHNAME'
	LANGUAGE C STRICT IMMUTABLE;

--
-- Accessor functions
--

CREATE OR REPLACE FUNCTION get_semver_major(semver)
	RETURNS int4
	AS 'MODULE_PATHNAME'
	LANGUAGE C STRICT IMMUTABLE;

CREATE OR REPLACE FUNCTION get_semver_minor(semver)
	RETURNS int4
	AS 'MODULE_PATHNAME'
	LANGUAGE C STRICT IMMUTABLE;

CREATE OR REPLACE FUNCTION get_semver_patch(semver)
	RETURNS int4
	AS 'MODULE_PATHNAME'
	LANGUAGE C STRICT IMMUTABLE;

CREATE OR REPLACE FUNCTION get_semver_prerelease(semver)
        RETURNS text
        AS 'MODULE_PATHNAME'
        LANGUAGE C STRICT IMMUTABLE;

CREATE TYPE semverrange AS RANGE (SUBTYPE = semver);
