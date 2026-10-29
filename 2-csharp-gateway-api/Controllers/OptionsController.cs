using System;
using System.Net.Http;
using System.Net.Http.Json;
using System.Threading.Tasks;
using Microsoft.AspNetCore.Mvc;
using QuantGateway.Models;

namespace QuantGateway.Controllers
{
    [ApiController]
    [Route("api/options")]
    public class OptionsController : ControllerBase
    {
        private readonly HttpClient _httpClient;

        //constructor
        public OptionsController(HttpClient httpClient)
        {
            _httpClient = httpClient;
        }

        [HttpPost("price")]
        public async Task<IActionResult> CalculatePrice([FromBody] OptionRequest request)
        {
            //read python url and secret key
            string pythonUrl = Environment.GetEnvironmentVariable("PYTHON_ENGINE_URL") ?? "http://127.0.0.1:8000/calculate";
            string apiKey = Environment.GetEnvironmentVariable("INTERNAL_API_KEY") ?? "quant_desk_dev_secret_2026";

            using var httpRequest = new HttpRequestMessage(HttpMethod.Post, pythonUrl);
            httpRequest.Headers.Add("X-Internal-Api-Key", apiKey);
            httpRequest.Content = JsonContent.Create(request);

            var response = await _httpClient.SendAsync(httpRequest);

            //error mangement
            if (!response.IsSuccessStatusCode)
            {
                var errorText = await response.Content.ReadAsStringAsync();
                return StatusCode((int)response.StatusCode, $"Python Engine Error: {errorText}");
            }

            var result = await response.Content.ReadFromJsonAsync<OptionResponse>();

            //return http 200
            return Ok(result);
        }
    }
}