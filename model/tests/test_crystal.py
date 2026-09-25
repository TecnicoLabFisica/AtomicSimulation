import numpy as np
import pytest
from pytest import approx

from braggsim.constants import D_NACL_PM, MO_KA_PM, MO_KB_PM
from braggsim.crystal import dlambda_dtheta_pm_per_deg, lambda_from_theta, theta_from_lambda

# LD P6.3.3.1 Table 2: expected glancing angles at NaCl (d = 282.01 pm), degrees, two decimals.
TABLE_2 = [
    (1, 7.24, 6.42),
    (2, 14.60, 12.93),
    (3, 22.21, 19.61),
]


@pytest.mark.parametrize(("n", "theta_ka", "theta_kb"), TABLE_2)
def test_bragg_angles_reproduce_leaflet_table_2(n, theta_ka, theta_kb):
    assert round(float(theta_from_lambda(MO_KA_PM, n)), 2) == theta_ka
    assert round(float(theta_from_lambda(MO_KB_PM, n)), 2) == theta_kb


@pytest.mark.parametrize("n", [1, 2, 3])
def test_lambda_from_theta_inverts_theta_from_lambda(n):
    lam = np.array([40.0, 71.08, 150.0])
    assert lambda_from_theta(theta_from_lambda(lam, n), n) == approx(lam, rel=1e-12)


def test_no_reflection_when_n_lambda_exceeds_2d():
    assert np.isnan(theta_from_lambda(2 * D_NACL_PM + 1.0, 1))
    assert np.isnan(theta_from_lambda(MO_KA_PM, 8))  # 8 · 71.08 pm > 564.02 pm
    assert theta_from_lambda(2 * D_NACL_PM, 1) == approx(90.0)


@pytest.mark.parametrize("n", [1, 2, 3])
def test_jacobian_matches_numerical_derivative(n):
    theta = np.array([3.0, 7.24, 20.0])
    h = 1e-5
    numeric = (lambda_from_theta(theta + h, n) - lambda_from_theta(theta - h, n)) / (2 * h)
    assert dlambda_dtheta_pm_per_deg(theta, n) == approx(numeric, rel=1e-7)


def test_lorentz_polarization_factor_textbook_values():
    from braggsim.crystal import lorentz_polarization

    # (1 + cos²2θ) / (2 sin 2θ): at θ = 45° the polarization term is 1/2 and sin 2θ = 1.
    assert lorentz_polarization(45.0) == approx(0.5)
    # At small θ it approaches 1/sin 2θ (fully unpolarized-beam limit).
    assert lorentz_polarization(1.0) == approx(1 / np.sin(np.radians(2.0)), rel=1e-3)


def test_unphysical_inputs_give_nan_not_a_wrong_angle():
    assert np.isnan(theta_from_lambda(-50.0))
    assert np.isnan(theta_from_lambda(71.08, n=0))
    assert np.isnan(lambda_from_theta(95.0)) and np.isnan(lambda_from_theta(-1.0))
